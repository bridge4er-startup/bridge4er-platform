from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from django.core.cache import cache
from django.db.models import Max

from storage.dropbox_service import list_folder_with_metadata

from .import_utils import DJANGO_IMPORT_EXPORT_AVAILABLE, SUPPORTED_IMPORT_EXTENSIONS, parse_rows_from_path
from .exam_file_metadata import build_exam_set_update_payload, extract_exam_rows_and_metadata
from .models import Chapter, ExamQuestion, ExamSet, MCQQuestion, Subject
from .question_normalizers import normalize_exam_question_payload, normalize_mcq_payload
from .resources import ExamQuestionResource, MCQQuestionResource

if DJANGO_IMPORT_EXPORT_AVAILABLE:
    from tablib import Dataset

_AUTO_SYNC_KEY_PREFIX = "dropbox_sync:last_run"


def _is_supported_file(path: str) -> bool:
    return Path(path).suffix.lower() in SUPPORTED_IMPORT_EXTENSIONS


def _list_supported_files(root_path: str) -> list[str]:
    entries = list_folder_with_metadata(root_path, include_dirs=False, recursive=True)
    files: list[str] = []
    for entry in entries:
        file_path = entry.get("path") or ""
        if not file_path or entry.get("is_dir"):
            continue
        if _is_supported_file(file_path):
            files.append(file_path)
    files.sort()
    return files


def _folder_signature(root_path: str) -> str:
    entries = list_folder_with_metadata(root_path, include_dirs=False, recursive=True)
    rows = []
    for entry in entries:
        file_path = entry.get("path") or ""
        if not file_path or entry.get("is_dir"):
            continue
        if not _is_supported_file(file_path):
            continue
        rows.append(f"{file_path}|{entry.get('modified', '')}|{entry.get('size', '')}")
    rows.sort()
    joined = "\n".join(rows)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def _normalize_mcq_question_payload(raw):
    return normalize_mcq_payload(raw)


def _normalize_exam_question_payload(raw, exam_type):
    return normalize_exam_question_payload(raw, exam_type)


def _is_valid_mcq_row(row: dict) -> bool:
    return bool(row.get("question_text")) and row.get("correct_option") in {"a", "b", "c", "d"}


def _is_valid_exam_row(row: dict, exam_type: str) -> bool:
    if not row.get("question_text"):
        return False
    if exam_type == "mcq" and row.get("correct_option") not in {"a", "b", "c", "d"}:
        return False
    return True


def _import_mcq_with_resource(chapter, normalized_questions):
    if not DJANGO_IMPORT_EXPORT_AVAILABLE or MCQQuestionResource is None:
        return _manual_import_objective(chapter, normalized_questions)

    resource = MCQQuestionResource()
    dataset = Dataset(
        headers=[
            "id",
            "chapter_id",
            "question_header",
            "question_text",
            "question_image_url",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option",
            "explanation",
        ]
    )
    skipped_rows = 0
    for row in normalized_questions:
        if not row["question_text"] or row["correct_option"] not in {"a", "b", "c", "d"}:
            skipped_rows += 1
            continue
        dataset.append(
            [
                row.get("id") or "",
                chapter.id,
                row["question_header"],
                row["question_text"],
                row["question_image_url"],
                row["option_a"],
                row["option_b"],
                row["option_c"],
                row["option_d"],
                row["correct_option"],
                row["explanation"],
            ]
        )

    if len(dataset) == 0:
        return {"new": 0, "updated": 0, "imported": 0, "skipped": skipped_rows, "error_rows": 0}

    result = resource.import_data(dataset, dry_run=False, raise_errors=False, use_transactions=True)
    totals = getattr(result, "totals", {}) or {}
    new_rows = int(totals.get("new", 0))
    updated_rows = int(totals.get("update", 0))
    return {
        "new": new_rows,
        "updated": updated_rows,
        "imported": new_rows + updated_rows,
        "skipped": skipped_rows + int(totals.get("skip", 0)),
        "error_rows": int(totals.get("error", 0)),
    }


def _import_exam_set_with_resource(exam_set, normalized_rows):
    if not DJANGO_IMPORT_EXPORT_AVAILABLE or ExamQuestionResource is None:
        return _manual_import_exam_set(exam_set, normalized_rows)

    resource = ExamQuestionResource()
    dataset = Dataset(
        headers=[
            "id",
            "exam_set_id",
            "order",
            "question_header",
            "question_text",
            "question_image_url",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option",
            "explanation",
            "marks",
        ]
    )
    skipped_rows = 0
    for row in normalized_rows:
        if not row["question_text"]:
            skipped_rows += 1
            continue
        if exam_set.exam_type == "mcq" and row.get("correct_option") not in {"a", "b", "c", "d"}:
            skipped_rows += 1
            continue

        dataset.append(
            [
                row.get("id") or "",
                exam_set.id,
                max(1, row["order"]),
                row["question_header"],
                row["question_text"],
                row["question_image_url"],
                row.get("option_a", ""),
                row.get("option_b", ""),
                row.get("option_c", ""),
                row.get("option_d", ""),
                row.get("correct_option") or None,
                row["explanation"],
                max(1, row["marks"]),
            ]
        )

    if len(dataset) == 0:
        return {"new": 0, "updated": 0, "imported": 0, "skipped": skipped_rows, "error_rows": 0}

    result = resource.import_data(dataset, dry_run=False, raise_errors=False, use_transactions=True)
    totals = getattr(result, "totals", {}) or {}
    new_rows = int(totals.get("new", 0))
    updated_rows = int(totals.get("update", 0))
    return {
        "new": new_rows,
        "updated": updated_rows,
        "imported": new_rows + updated_rows,
        "skipped": skipped_rows + int(totals.get("skip", 0)),
        "error_rows": int(totals.get("error", 0)),
    }


def _manual_import_objective(chapter: Chapter, normalized_questions: list[dict]) -> dict:
    created = 0
    skipped = 0
    for q_data in normalized_questions:
        if not q_data["question_text"] or q_data["correct_option"] not in {"a", "b", "c", "d"}:
            skipped += 1
            continue

        MCQQuestion.objects.create(
            chapter=chapter,
            question_header=q_data["question_header"],
            question_text=q_data["question_text"],
            question_image_url=q_data["question_image_url"],
            option_a=q_data["option_a"],
            option_b=q_data["option_b"],
            option_c=q_data["option_c"],
            option_d=q_data["option_d"],
            correct_option=q_data["correct_option"],
            explanation=q_data["explanation"],
        )
        created += 1
    return {"new": created, "updated": 0, "imported": created, "skipped": skipped, "error_rows": 0}


def _manual_import_exam_set(exam_set: ExamSet, normalized_rows: list[dict]) -> dict:
    created = 0
    skipped = 0
    for row in normalized_rows:
        if not row["question_text"]:
            skipped += 1
            continue
        if exam_set.exam_type == "mcq" and row.get("correct_option") not in {"a", "b", "c", "d"}:
            skipped += 1
            continue

        ExamQuestion.objects.create(
            exam_set=exam_set,
            order=max(1, row["order"]),
            question_header=row["question_header"],
            question_text=row["question_text"],
            question_image_url=row["question_image_url"],
            option_a=row.get("option_a", ""),
            option_b=row.get("option_b", ""),
            option_c=row.get("option_c", ""),
            option_d=row.get("option_d", ""),
            correct_option=row.get("correct_option") or None,
            explanation=row["explanation"],
            marks=max(1, row["marks"]),
        )
        created += 1
    return {"new": created, "updated": 0, "imported": created, "skipped": skipped, "error_rows": 0}


def sync_objective_mcqs_from_dropbox(branch: str, replace_existing: bool = True) -> dict:
    root_path = f"/bridge4er/{branch}/Objective MCQs/Subjects"
    file_paths = _list_supported_files(root_path)

    summary = {
        "root_path": root_path,
        "discovered_files": len(file_paths),
        "processed_files": 0,
        "subjects_created": 0,
        "chapters_created": 0,
        "imported_questions": 0,
        "skipped_rows": 0,
        "skipped_files": 0,
        "error_files": 0,
        "files": [],
    }

    for file_path in file_paths:
        item = {"path": file_path, "status": "ok", "imported": 0, "skipped": 0}
        try:
            rows = parse_rows_from_path(file_path)
            normalized_questions = [_normalize_mcq_question_payload(raw) for raw in rows]
            valid_questions = [row for row in normalized_questions if _is_valid_mcq_row(row)]
            skipped_rows = max(0, len(normalized_questions) - len(valid_questions))
            item["skipped"] = skipped_rows
            summary["skipped_rows"] += skipped_rows

            if not valid_questions:
                item["status"] = "skipped"
                item["reason"] = "no_valid_questions"
                summary["skipped_files"] += 1
                summary["processed_files"] += 1
                summary["files"].append(item)
                continue

            relative = file_path[len(root_path):].lstrip("/")
            parts = [p for p in relative.split("/") if p]
            if len(parts) < 2:
                raise ValueError("Expected path format: <Subject>/<ChapterFile>")

            subject_name = parts[0].strip()
            chapter_name = Path(parts[-1]).stem.strip()
            if not subject_name or not chapter_name:
                raise ValueError("Subject or chapter name missing in file path")

            subject, subject_created = Subject.objects.get_or_create(name=subject_name, branch=branch)
            if subject_created:
                summary["subjects_created"] += 1

            next_order = (Chapter.objects.filter(subject=subject).aggregate(max_order=Max("order")).get("max_order") or 0) + 1
            chapter, chapter_created = Chapter.objects.get_or_create(
                subject=subject,
                name=chapter_name,
                defaults={"order": next_order},
            )
            if chapter_created:
                summary["chapters_created"] += 1

            if replace_existing:
                MCQQuestion.objects.filter(chapter=chapter).delete()

            import_summary = _import_mcq_with_resource(chapter, valid_questions)

            item["subject"] = subject.name
            item["chapter"] = chapter.name
            item["imported"] = int(import_summary.get("imported", 0))
            item["skipped"] += int(import_summary.get("skipped", 0))
            summary["imported_questions"] += item["imported"]
            summary["skipped_rows"] += int(import_summary.get("skipped", 0))
            summary["processed_files"] += 1
        except ValueError as exc:
            item["status"] = "skipped"
            item["reason"] = str(exc)
            summary["skipped_files"] += 1
            summary["processed_files"] += 1
        except Exception as exc:
            item["status"] = "error"
            item["error"] = str(exc)
            summary["error_files"] += 1
        summary["files"].append(item)

    return summary


def _sync_exam_set_type(branch: str, exam_type: str, root_path: str, replace_existing: bool) -> dict:
    file_paths = _list_supported_files(root_path)
    result = {
        "root_path": root_path,
        "discovered_files": len(file_paths),
        "processed_files": 0,
        "sets_created": 0,
        "imported_questions": 0,
        "skipped_rows": 0,
        "skipped_files": 0,
        "error_files": 0,
        "files": [],
    }

    for file_path in file_paths:
        item = {"path": file_path, "status": "ok", "imported": 0, "skipped": 0}
        try:
            rows = parse_rows_from_path(file_path)
            raw_rows, exam_info, instructions = extract_exam_rows_and_metadata(rows)
            normalized_rows = [_normalize_exam_question_payload(raw, exam_type) for raw in raw_rows]
            valid_rows = [row for row in normalized_rows if _is_valid_exam_row(row, exam_type)]
            skipped_rows = max(0, len(normalized_rows) - len(valid_rows))
            item["skipped"] = skipped_rows
            result["skipped_rows"] += skipped_rows

            if not valid_rows:
                item["status"] = "skipped"
                item["reason"] = "no_valid_questions"
                result["skipped_files"] += 1
                result["processed_files"] += 1
                result["files"].append(item)
                continue

            source_set_name = Path(file_path).stem.strip()
            if not source_set_name:
                raise ValueError("Invalid exam set file name")

            set_updates = build_exam_set_update_payload(
                exam_type=exam_type,
                fallback_name=source_set_name,
                exam_info=exam_info,
                instructions=instructions,
            )

            exam_set, created = ExamSet.objects.get_or_create(
                name=source_set_name,
                branch=branch,
                exam_type=exam_type,
                defaults={key: value for key, value in set_updates.items() if key != "name"},
            )
            if created:
                result["sets_created"] += 1

            update_fields = []
            for field_name, field_value in set_updates.items():
                if field_name == "name":
                    continue
                setattr(exam_set, field_name, field_value)
                update_fields.append(field_name)

            desired_name = set_updates.get("name") or source_set_name
            has_name_conflict = (
                ExamSet.objects.filter(name=desired_name, branch=branch, exam_type=exam_type)
                .exclude(id=exam_set.id)
                .exists()
            )
            if desired_name and not has_name_conflict and exam_set.name != desired_name:
                exam_set.name = desired_name
                update_fields.append("name")

            if update_fields:
                exam_set.save(update_fields=sorted(set(update_fields)))

            if replace_existing:
                exam_set.questions.all().delete()

            import_summary = _import_exam_set_with_resource(exam_set, valid_rows)

            item["exam_set"] = exam_set.name
            item["imported"] = int(import_summary.get("imported", 0))
            item["skipped"] += int(import_summary.get("skipped", 0))
            result["imported_questions"] += item["imported"]
            result["skipped_rows"] += int(import_summary.get("skipped", 0))
            result["processed_files"] += 1
        except ValueError as exc:
            item["status"] = "skipped"
            item["reason"] = str(exc)
            result["skipped_files"] += 1
            result["processed_files"] += 1
        except Exception as exc:
            item["status"] = "error"
            item["error"] = str(exc)
            result["error_files"] += 1
        result["files"].append(item)

    return result


def sync_exam_sets_from_dropbox(branch: str, replace_existing: bool = True) -> dict:
    mcq_root = f"/bridge4er/{branch}/Take Exam/Multiple Choice Exam"
    subjective_root = f"/bridge4er/{branch}/Take Exam/Subjective Exam"
    return {
        "mcq": _sync_exam_set_type(branch, "mcq", mcq_root, replace_existing),
        "subjective": _sync_exam_set_type(branch, "subjective", subjective_root, replace_existing),
    }


def auto_sync_dropbox_for_branch(
    branch: str,
    sync_objective: bool = False,
    sync_exam_sets: bool = False,
    replace_existing: bool = True,
    cooldown_seconds: int = 60,
):
    if not sync_objective and not sync_exam_sets:
        return {"status": "skipped", "reason": "nothing_requested"}

    key_seed = f"{branch}|{int(sync_objective)}|{int(sync_exam_sets)}|{int(replace_existing)}"
    cache_key = f"{_AUTO_SYNC_KEY_PREFIX}:{hashlib.sha1(key_seed.encode('utf-8')).hexdigest()}"
    sig_key = f"{cache_key}:signature"

    signatures = {}
    if sync_objective:
        signatures["objective"] = _folder_signature(f"/bridge4er/{branch}/Objective MCQs/Subjects")
    if sync_exam_sets:
        signatures["exam_mcq"] = _folder_signature(f"/bridge4er/{branch}/Take Exam/Multiple Choice Exam")
        signatures["exam_subjective"] = _folder_signature(f"/bridge4er/{branch}/Take Exam/Subjective Exam")

    current_signature = hashlib.sha1(json.dumps(signatures, sort_keys=True).encode("utf-8")).hexdigest()
    previous_signature = cache.get(sig_key)
    if previous_signature and previous_signature == current_signature:
        return {"status": "skipped", "reason": "no_changes"}

    now = time.time()
    last_run = cache.get(cache_key)
    if last_run and (now - float(last_run)) < max(5, int(cooldown_seconds)):
        return {"status": "skipped", "reason": "cooldown"}

    cache.set(cache_key, now, timeout=max(5, int(cooldown_seconds)))

    result = {"status": "ok", "branch": branch}
    try:
        if sync_objective:
            result["objective"] = sync_objective_mcqs_from_dropbox(branch=branch, replace_existing=replace_existing)
        if sync_exam_sets:
            result["exam_sets"] = sync_exam_sets_from_dropbox(branch=branch, replace_existing=replace_existing)
        cache.set(sig_key, current_signature, timeout=60 * 60 * 24)
    except Exception as exc:
        result["status"] = "error"
        result["error"] = str(exc)
    return result
