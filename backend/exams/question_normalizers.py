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


def _key_token(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", _to_text(value).lower())


def _build_lookup(raw: dict) -> dict[str, object]:
    lookup: dict[str, object] = {}
    if not isinstance(raw, dict):
        return lookup
    for key, value in raw.items():
        token = _key_token(key)
        if not token or token in lookup:
            continue
        lookup[token] = value
    return lookup


def _pick(raw: dict, lookup: dict[str, object], *aliases):
    for alias in aliases:
        if alias in raw:
            value = raw.get(alias)
            if value not in (None, ""):
                return value
    for alias in aliases:
        token = _key_token(alias)
        if token in lookup:
            value = lookup[token]
            if value not in (None, ""):
                return value
    return ""


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
    lookup = _build_lookup(raw)
    option_map = {
        "a": _to_text(option_a),
        "b": _to_text(option_b),
        "c": _to_text(option_c),
        "d": _to_text(option_d),
    }

    candidates = [
        _pick(raw, lookup, "correct_option", "correctOption", "correct option", "correctoption"),
        _pick(raw, lookup, "correct", "correct_answer", "correct answer", "correctAnswer"),
        _pick(raw, lookup, "answer", "answer_key", "answer key", "ans", "right_answer", "right answer"),
        _pick(raw, lookup, "answerIndex", "answer_index", "answer index"),
        _pick(raw, lookup, "correctIndex", "correct_index", "correct index"),
    ]

    for candidate in candidates:
        letter = _candidate_to_letter(candidate, option_map)
        if letter:
            return letter

    return ""


def normalize_mcq_payload(raw: dict) -> dict:
    lookup = _build_lookup(raw)
    options = _parse_options_value(_pick(raw, lookup, "options", "option_list", "option list", "choices"))

    option_a = _to_text(
        _pick(
            raw,
            lookup,
            "option_a",
            "option a",
            "optiona",
            "option 1",
            "choice_a",
            "choice a",
            "choicea",
            "choice 1",
            "a",
            "1",
        )
        or (options[0] if len(options) > 0 else "")
    )
    option_b = _to_text(
        _pick(
            raw,
            lookup,
            "option_b",
            "option b",
            "optionb",
            "option 2",
            "choice_b",
            "choice b",
            "choiceb",
            "choice 2",
            "b",
            "2",
        )
        or (options[1] if len(options) > 1 else "")
    )
    option_c = _to_text(
        _pick(
            raw,
            lookup,
            "option_c",
            "option c",
            "optionc",
            "option 3",
            "choice_c",
            "choice c",
            "choicec",
            "choice 3",
            "c",
            "3",
        )
        or (options[2] if len(options) > 2 else "")
    )
    option_d = _to_text(
        _pick(
            raw,
            lookup,
            "option_d",
            "option d",
            "optiond",
            "option 4",
            "choice_d",
            "choice d",
            "choiced",
            "choice 4",
            "d",
            "4",
        )
        or (options[3] if len(options) > 3 else "")
    )

    return {
        "id": _to_text(_pick(raw, lookup, "id")),
        "question_header": _to_text(
            _pick(
                raw,
                lookup,
                "question_header",
                "question header",
                "questionHeader",
                "header",
                "section",
                "section_title",
                "section title",
            )
        ),
        "question_text": _to_text(
            _pick(
                raw,
                lookup,
                "question_text",
                "question text",
                "question",
                "question_statement",
                "question statement",
                "statement",
                "prompt",
                "mcq",
                "text",
                "questiontitle",
                "question_title",
            )
        ),
        "option_a": option_a,
        "option_b": option_b,
        "option_c": option_c,
        "option_d": option_d,
        "correct_option": resolve_correct_option(raw, option_a, option_b, option_c, option_d),
        "explanation": _to_text(_pick(raw, lookup, "explanation", "explain", "solution", "answer_explanation")),
        "question_image_url": _to_text(
            _pick(
                raw,
                lookup,
                "question_image_url",
                "question image url",
                "questionImageUrl",
                "question_image",
                "question image",
                "image",
                "image_url",
                "question_figure",
            )
        ),
    }


def normalize_exam_question_payload(raw: dict, exam_type: str) -> dict:
    lookup = _build_lookup(raw)
    payload = {
        "id": _to_text(_pick(raw, lookup, "id")),
        "order": _to_int(_pick(raw, lookup, "order", "no", "index", "qno", "question no"), 0),
        "question_header": _to_text(
            _pick(raw, lookup, "question_header", "question header", "header", "questionHeader", "section")
        ),
        "question_text": _to_text(
            _pick(
                raw,
                lookup,
                "question_text",
                "question text",
                "question",
                "question_statement",
                "question statement",
                "statement",
                "prompt",
                "text",
                "question_title",
            )
        ),
        "question_image_url": _to_text(
            _pick(
                raw,
                lookup,
                "question_image_url",
                "question image url",
                "questionImageUrl",
                "question_image",
                "question image",
                "image",
                "image_url",
            )
        ),
        "marks": _to_int(_pick(raw, lookup, "marks", "mark", "weightage") or 1, 1),
        "explanation": _to_text(_pick(raw, lookup, "explanation", "solution", "explain")),
        "option_a": "",
        "option_b": "",
        "option_c": "",
        "option_d": "",
        "correct_option": "",
    }

    subquestions = _pick(raw, lookup, "subquestions", "sub_questions", "sub questions")
    if isinstance(subquestions, str):
        try:
            parsed_sub = json.loads(subquestions)
            if isinstance(parsed_sub, list):
                subquestions = parsed_sub
        except (TypeError, ValueError):
            subquestions = []
    if not payload["question_text"] and isinstance(subquestions, list):
        lines = [_to_text(item) for item in subquestions if _to_text(item)]
        if lines:
            payload["question_text"] = "\n".join(lines)

    if exam_type == "mcq":
        options = _parse_options_value(_pick(raw, lookup, "options", "option_list", "choices"))
        option_a = _to_text(
            _pick(raw, lookup, "option_a", "option a", "optiona", "option 1", "choice_a", "choice a", "choice 1", "a", "1")
            or (options[0] if len(options) > 0 else "")
        )
        option_b = _to_text(
            _pick(raw, lookup, "option_b", "option b", "optionb", "option 2", "choice_b", "choice b", "choice 2", "b", "2")
            or (options[1] if len(options) > 1 else "")
        )
        option_c = _to_text(
            _pick(raw, lookup, "option_c", "option c", "optionc", "option 3", "choice_c", "choice c", "choice 3", "c", "3")
            or (options[2] if len(options) > 2 else "")
        )
        option_d = _to_text(
            _pick(raw, lookup, "option_d", "option d", "optiond", "option 4", "choice_d", "choice d", "choice 4", "d", "4")
            or (options[3] if len(options) > 3 else "")
        )
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
