from __future__ import annotations

import ast
import json
import re


def _to_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _to_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_options_value(options):
    if isinstance(options, str):
        try:
            options = json.loads(options)
        except (TypeError, ValueError):
            try:
                options = ast.literal_eval(options)
            except (ValueError, SyntaxError):
                options = None

    if isinstance(options, dict):
        ordered = []
        for key in ("a", "b", "c", "d", "1", "2", "3", "4"):
            if key in options:
                ordered.append(options[key])
        if ordered:
            return ordered
        return list(options.values())

    if isinstance(options, (list, tuple)):
        return list(options)

    return []


def _normalize_for_compare(value: str) -> str:
    return " ".join(_to_text(value).lower().split())


def _candidate_to_letter(candidate, option_map: dict[str, str]) -> str:
    if candidate is None:
        return ""

    if isinstance(candidate, dict):
        for key in ("option", "answer", "correct", "value"):
            if key in candidate:
                return _candidate_to_letter(candidate[key], option_map)
        return ""

    if isinstance(candidate, (list, tuple)):
        if not candidate:
            return ""
        return _candidate_to_letter(candidate[0], option_map)

    if isinstance(candidate, int):
        if 1 <= candidate <= 4:
            return "abcd"[candidate - 1]
        if 0 <= candidate <= 3:
            return "abcd"[candidate]

    value = _to_text(candidate)
    if not value:
        return ""
    lowered = value.lower()

    if lowered in {"a", "b", "c", "d"}:
        return lowered

    if lowered.isdigit():
        idx = int(lowered)
        if 1 <= idx <= 4:
            return "abcd"[idx - 1]
        if 0 <= idx <= 3:
            return "abcd"[idx]

    match = re.match(r"^(?:option\s*)?([abcd])(?:[\)\].:\-\s]|$)", lowered)
    if match:
        return match.group(1)

    compare_value = _normalize_for_compare(value)
    if not compare_value:
        return ""

    for letter, option_text in option_map.items():
        if compare_value == _normalize_for_compare(option_text):
            return letter

    return ""


def resolve_correct_option(raw: dict, option_a: str, option_b: str, option_c: str, option_d: str) -> str:
    option_map = {
        "a": _to_text(option_a),
        "b": _to_text(option_b),
        "c": _to_text(option_c),
        "d": _to_text(option_d),
    }

    candidates = [
        raw.get("correct_option"),
        raw.get("correctOption"),
        raw.get("correct"),
        raw.get("correct_answer"),
        raw.get("correctAnswer"),
        raw.get("answer"),
        raw.get("answer_key"),
        raw.get("answerIndex"),
        raw.get("answer_index"),
        raw.get("correctIndex"),
        raw.get("correct_index"),
        raw.get("ans"),
    ]

    for candidate in candidates:
        letter = _candidate_to_letter(candidate, option_map)
        if letter:
            return letter

    return ""


def normalize_mcq_payload(raw: dict) -> dict:
    options = _parse_options_value(raw.get("options"))

    option_a = _to_text(raw.get("option_a") or raw.get("a") or (options[0] if len(options) > 0 else ""))
    option_b = _to_text(raw.get("option_b") or raw.get("b") or (options[1] if len(options) > 1 else ""))
    option_c = _to_text(raw.get("option_c") or raw.get("c") or (options[2] if len(options) > 2 else ""))
    option_d = _to_text(raw.get("option_d") or raw.get("d") or (options[3] if len(options) > 3 else ""))

    return {
        "id": _to_text(raw.get("id")),
        "question_header": _to_text(raw.get("question_header") or raw.get("header") or raw.get("questionHeader")),
        "question_text": _to_text(raw.get("question_text") or raw.get("question") or raw.get("text")),
        "option_a": option_a,
        "option_b": option_b,
        "option_c": option_c,
        "option_d": option_d,
        "correct_option": resolve_correct_option(raw, option_a, option_b, option_c, option_d),
        "explanation": _to_text(raw.get("explanation")),
        "question_image_url": _to_text(
            raw.get("question_image_url") or raw.get("image") or raw.get("questionImageUrl")
        ),
    }


def normalize_exam_question_payload(raw: dict, exam_type: str) -> dict:
    payload = {
        "id": _to_text(raw.get("id")),
        "order": _to_int(raw.get("order") or raw.get("no") or raw.get("index"), 0),
        "question_header": _to_text(raw.get("question_header") or raw.get("header") or raw.get("questionHeader")),
        "question_text": _to_text(raw.get("question_text") or raw.get("question") or raw.get("text")),
        "question_image_url": _to_text(
            raw.get("question_image_url") or raw.get("image") or raw.get("questionImageUrl")
        ),
        "marks": _to_int(raw.get("marks") or 1, 1),
        "explanation": _to_text(raw.get("explanation")),
        "option_a": "",
        "option_b": "",
        "option_c": "",
        "option_d": "",
        "correct_option": "",
    }

    subquestions = raw.get("subquestions") or raw.get("sub_questions")
    if not payload["question_text"] and isinstance(subquestions, list):
        lines = [_to_text(item) for item in subquestions if _to_text(item)]
        if lines:
            payload["question_text"] = "\n".join(lines)

    if exam_type == "mcq":
        options = _parse_options_value(raw.get("options"))
        option_a = _to_text(raw.get("option_a") or raw.get("a") or (options[0] if len(options) > 0 else ""))
        option_b = _to_text(raw.get("option_b") or raw.get("b") or (options[1] if len(options) > 1 else ""))
        option_c = _to_text(raw.get("option_c") or raw.get("c") or (options[2] if len(options) > 2 else ""))
        option_d = _to_text(raw.get("option_d") or raw.get("d") or (options[3] if len(options) > 3 else ""))
        payload.update(
            {
                "option_a": option_a,
                "option_b": option_b,
                "option_c": option_c,
                "option_d": option_d,
                "correct_option": resolve_correct_option(raw, option_a, option_b, option_c, option_d),
            }
        )

    return payload
