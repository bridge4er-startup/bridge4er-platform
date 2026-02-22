from __future__ import annotations

from pathlib import Path

GENERAL_INSTITUTION = "General"
SUBJECT_KEY_SEPARATOR = " :: "
INSTITUTION_KEY_SEPARATOR = " > "


def _split_path(path: str) -> list[str]:
    return [segment.strip() for segment in str(path or "").split("/") if str(segment or "").strip()]


def _relative_parts_after_anchor(path: str, anchor_parts: list[str]) -> list[str]:
    parts = _split_path(path)
    if not parts or not anchor_parts:
        return []
    lowered = [item.lower() for item in parts]
    anchor_lower = [item.lower() for item in anchor_parts]
    span = len(anchor_lower)
    for index in range(0, len(lowered) - span + 1):
        if lowered[index : index + span] == anchor_lower:
            return parts[index + span :]
    return []


def build_subject_key(institution_key: str, subject_name: str) -> str:
    clean_subject = str(subject_name or "").strip()
    clean_institution = str(institution_key or "").strip()
    if not clean_institution or clean_institution == GENERAL_INSTITUTION:
        return clean_subject
    return f"{clean_institution}{SUBJECT_KEY_SEPARATOR}{clean_subject}"


def parse_subject_key(subject_key: str) -> dict:
    raw = str(subject_key or "").strip()
    if SUBJECT_KEY_SEPARATOR in raw:
        institution_key, subject_name = raw.split(SUBJECT_KEY_SEPARATOR, 1)
        institution_key = institution_key.strip() or GENERAL_INSTITUTION
        subject_name = subject_name.strip()
    else:
        institution_key = GENERAL_INSTITUTION
        subject_name = raw

    institution_parts = [item.strip() for item in institution_key.split(INSTITUTION_KEY_SEPARATOR) if item.strip()]
    institution_path = "/".join(institution_parts)
    institution_display = " / ".join(institution_parts) if institution_parts else GENERAL_INSTITUTION

    return {
        "subject_key": raw,
        "subject_name": subject_name,
        "institution_key": institution_key or GENERAL_INSTITUTION,
        "institution_display": institution_display,
        "institution_parts": institution_parts,
        "institution_path": institution_path,
    }


def parse_objective_file_path(file_path: str, branch: str) -> dict | None:
    relative_parts = _relative_parts_after_anchor(file_path, ["bridge4er", branch, "Objective MCQs"])
    if not relative_parts:
        return None
    if relative_parts and relative_parts[0].lower() == "subjects":
        relative_parts = relative_parts[1:]
    if len(relative_parts) < 2:
        return None

    chapter_file = relative_parts[-1]
    chapter_name = Path(chapter_file).stem.strip()
    subject_name = relative_parts[-2].strip()
    if not chapter_name or not subject_name:
        return None

    institution_parts = [item.strip() for item in relative_parts[:-2] if item.strip()]
    institution_key = INSTITUTION_KEY_SEPARATOR.join(institution_parts) if institution_parts else GENERAL_INSTITUTION

    return {
        "relative_parts": relative_parts,
        "subject_name": subject_name,
        "chapter_name": chapter_name,
        "institution_parts": institution_parts,
        "institution_key": institution_key,
        "institution_display": " / ".join(institution_parts) if institution_parts else GENERAL_INSTITUTION,
        "subject_key": build_subject_key(institution_key, subject_name),
    }


def objective_subject_roots(branch: str, subject_key_or_name: str) -> list[str]:
    parsed = parse_subject_key(subject_key_or_name)
    subject_name = parsed["subject_name"]
    candidates: list[str] = []
    if parsed["institution_path"]:
        candidates.append(f"/bridge4er/{branch}/Objective MCQs/{parsed['institution_path']}/{subject_name}")
    candidates.append(f"/bridge4er/{branch}/Objective MCQs/Subjects/{subject_name}")
    candidates.append(f"/bridge4er/{branch}/Objective MCQs/{subject_name}")
    seen: set[str] = set()
    ordered: list[str] = []
    for item in candidates:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def parse_exam_source_path(source_file_path: str, branch: str, exam_type: str) -> dict:
    exam_folder = "Multiple Choice Exam" if exam_type == "mcq" else "Subjective Exam"
    relative_parts = _relative_parts_after_anchor(source_file_path, ["bridge4er", branch, "Take Exam", exam_folder])

    if not relative_parts:
        source_name = Path(str(source_file_path or "")).stem.strip()
        return {
            "relative_parts": [],
            "folder_parts": [],
            "folder_path": "",
            "institution": GENERAL_INSTITUTION,
            "topic_path": "",
            "source_name": source_name,
        }

    file_stem = Path(relative_parts[-1]).stem.strip() if relative_parts else ""
    folder_parts = relative_parts[:-1]
    institution = folder_parts[0] if folder_parts else GENERAL_INSTITUTION
    topic_parts = folder_parts[1:] if len(folder_parts) > 1 else []

    return {
        "relative_parts": relative_parts,
        "folder_parts": folder_parts,
        "folder_path": " / ".join(folder_parts),
        "institution": institution,
        "topic_path": " / ".join(topic_parts),
        "source_name": file_stem,
    }
