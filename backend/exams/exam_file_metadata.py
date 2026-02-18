from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any


DEFAULT_EXAM_INFO = {
    "title": "bridge4er test files",
    "subtitle": "इन्जिनियरिंग सेवा, सिभिल समूह",
    "date": " ",
    "time": "1 Hour",
    "paper": " ",
    "subject": "Civil Engineering",
    "full_marks": "100",
    "ispaid": "True",
    "price": "NPR. 50",
}

DEFAULT_INSTRUCTIONS = [
    "सबै प्रश्न अनिवार्य छन्",
]

EXAM_INFO_KEY_MAP = {
    "title": "title",
    "subtitle": "subtitle",
    "date": "date",
    "time": "time",
    "paper": "paper",
    "subject": "subject",
    "fullmarks": "full_marks",
    "full_mark": "full_marks",
    "full_marks": "full_marks",
    "fullmark": "full_marks",
    "ispaid": "ispaid",
    "is_paid": "ispaid",
    "price": "price",
}

QUESTION_HEADER_TOKENS = {
    "id",
    "order",
    "question",
    "question_text",
    "question_header",
    "question_image_url",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_option",
    "correct",
    "explanation",
    "marks",
}

QUESTION_COLUMN_MAP = {
    "id": "id",
    "order": "order",
    "question": "question",
    "question_text": "question",
    "question_header": "question_header",
    "question_image_url": "question_image_url",
    "questionimageurl": "question_image_url",
    "question_image": "question_image_url",
    "image": "question_image_url",
    "option_a": "option_a",
    "optiona": "option_a",
    "option_b": "option_b",
    "optionb": "option_b",
    "option_c": "option_c",
    "optionc": "option_c",
    "option_d": "option_d",
    "optiond": "option_d",
    "correct_option": "correct_option",
    "correctoption": "correct_option",
    "correct_answer": "correct_option",
    "correctanswer": "correct_option",
    "correct": "correct_option",
    "answer": "correct_option",
    "explanation": "explanation",
    "marks": "marks",
}


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_key(value: Any) -> str:
    text = _to_text(value).lower()
    if not text:
        return ""
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _as_instruction_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [_to_text(item) for item in value if _to_text(item)]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [_to_text(item) for item in parsed if _to_text(item)]
        except (TypeError, ValueError):
            pass
        return [line.strip() for line in raw.splitlines() if line.strip()]
    return []


def _merge_exam_info(overrides: dict[str, Any] | None) -> dict[str, str]:
    merged = dict(DEFAULT_EXAM_INFO)
    if not isinstance(overrides, dict):
        return merged

    for raw_key, raw_value in overrides.items():
        normalized_key = EXAM_INFO_KEY_MAP.get(_normalize_key(raw_key))
        if not normalized_key:
            continue
        value = _to_text(raw_value)
        if value:
            merged[normalized_key] = value
    return merged


def _parse_embedded_metadata(rows: list[dict[str, str]]) -> tuple[dict[str, Any], list[str]]:
    if not rows:
        return {}, []

    first_row = rows[0]
    exam_info_raw = first_row.pop("__exam_info__", None) or first_row.pop("__exam_info", None)
    instructions_raw = first_row.pop("__instructions__", None) or first_row.pop("__instructions", None)

    exam_info: dict[str, Any] = {}
    if exam_info_raw:
        try:
            parsed = json.loads(exam_info_raw)
            if isinstance(parsed, dict):
                exam_info = parsed
        except (TypeError, ValueError):
            exam_info = {}

    instructions = _as_instruction_list(instructions_raw)
    return exam_info, instructions


def _looks_like_question_header(tokens: list[str]) -> bool:
    return sum(1 for token in tokens if token in QUESTION_HEADER_TOKENS) >= 3


def _extract_exam_rows_from_row_structured_table(
    rows: list[dict[str, str]]
) -> tuple[list[dict[str, str]], dict[str, str]] | None:
    if not rows:
        return None

    key_order = list(rows[0].keys())
    normalized_key_order = [_normalize_key(key) for key in key_order]
    exam_key_hits = sum(1 for key in normalized_key_order if key in EXAM_INFO_KEY_MAP)
    if exam_key_hits < 5:
        return None

    def row_values(row: dict[str, str]) -> list[str]:
        return [_to_text(row.get(key)) for key in key_order]

    first_values = row_values(rows[0])
    first_value_tokens = [_normalize_key(value) for value in first_values]

    extracted_exam_info: dict[str, str] = {}
    question_columns: list[str] = []
    data_start_index = 1

    if _looks_like_question_header(first_value_tokens):
        question_columns = first_value_tokens
    else:
        for idx, raw_key in enumerate(normalized_key_order):
            canonical = EXAM_INFO_KEY_MAP.get(raw_key)
            if not canonical:
                continue
            value = first_values[idx] if idx < len(first_values) else ""
            if value:
                extracted_exam_info[canonical] = value

        if len(rows) < 2:
            return ([], extracted_exam_info)

        second_values = row_values(rows[1])
        second_tokens = [_normalize_key(value) for value in second_values]
        if not _looks_like_question_header(second_tokens):
            return None
        question_columns = second_tokens
        data_start_index = 2

    normalized_question_columns = [QUESTION_COLUMN_MAP.get(token, token) for token in question_columns]
    question_rows: list[dict[str, str]] = []
    for source_row in rows[data_start_index:]:
        values = row_values(source_row)
        transformed: dict[str, str] = {}
        for idx, column in enumerate(normalized_question_columns):
            if not column:
                continue
            transformed[column] = values[idx] if idx < len(values) else ""
        if any(_to_text(value) for value in transformed.values()):
            question_rows.append(transformed)

    return question_rows, extracted_exam_info


def _to_bool(value: Any, default: bool = True) -> bool:
    text = _to_text(value).lower()
    if not text:
        return default
    if text in {"1", "true", "yes", "y", "paid"}:
        return True
    if text in {"0", "false", "no", "n", "free"}:
        return False
    return default


def parse_duration_seconds(time_value: Any, default_seconds: int = 3600) -> int:
    text = _to_text(time_value).lower()
    if not text:
        return default_seconds

    if ":" in text:
        parts = [part.strip() for part in text.split(":")]
        if all(part.isdigit() for part in parts):
            if len(parts) == 2:
                minutes, seconds = (int(parts[0]), int(parts[1]))
                return max(60, (minutes * 60) + seconds)
            if len(parts) == 3:
                hours, minutes, seconds = (int(parts[0]), int(parts[1]), int(parts[2]))
                return max(60, (hours * 3600) + (minutes * 60) + seconds)

    number_match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not number_match:
        return default_seconds

    value = float(number_match.group(1))
    if "hour" in text or "hr" in text or re.search(r"\bh\b", text):
        return max(60, int(round(value * 3600)))
    if "minute" in text or "min" in text or re.search(r"\bm\b", text):
        return max(60, int(round(value * 60)))
    if "second" in text or "sec" in text or re.search(r"\bs\b", text):
        return max(60, int(round(value)))

    # Plain numeric values are treated as minutes.
    return max(60, int(round(value * 60)))


def parse_price_value(price_value: Any, default_value: Decimal = Decimal("50")) -> Decimal:
    raw = _to_text(price_value)
    if not raw:
        return default_value

    cleaned = re.sub(r"[^0-9.]", "", raw)
    if not cleaned:
        return default_value
    try:
        return Decimal(cleaned)
    except (InvalidOperation, TypeError, ValueError):
        return default_value


def extract_exam_rows_and_metadata(
    rows: list[dict[str, str]],
) -> tuple[list[dict[str, str]], dict[str, str], list[str]]:
    cleaned_rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        cleaned_rows.append({str(key): _to_text(value) for key, value in row.items() if key is not None})

    embedded_exam_info, embedded_instructions = _parse_embedded_metadata(cleaned_rows)

    extracted_exam_info: dict[str, str] = {}
    structured = _extract_exam_rows_from_row_structured_table(cleaned_rows)
    if structured is not None:
        cleaned_rows, extracted_exam_info = structured

    for row in cleaned_rows:
        row.pop("__exam_info__", None)
        row.pop("__exam_info", None)
        row.pop("__instructions__", None)
        row.pop("__instructions", None)

    merged_exam_info = _merge_exam_info({**extracted_exam_info, **embedded_exam_info})
    instruction_list = embedded_instructions or list(DEFAULT_INSTRUCTIONS)
    return cleaned_rows, merged_exam_info, instruction_list


def build_exam_set_update_payload(
    exam_type: str,
    fallback_name: str,
    exam_info: dict[str, Any] | None,
    instructions: list[str] | None,
) -> dict[str, Any]:
    merged_exam_info = _merge_exam_info(exam_info)

    title = _to_text(merged_exam_info.get("title")) or _to_text(fallback_name) or DEFAULT_EXAM_INFO["title"]
    subtitle = _to_text(merged_exam_info.get("subtitle"))
    subject = _to_text(merged_exam_info.get("subject"))
    paper = _to_text(merged_exam_info.get("paper"))
    date = _to_text(merged_exam_info.get("date"))
    full_marks = _to_text(merged_exam_info.get("full_marks"))
    duration_seconds = parse_duration_seconds(merged_exam_info.get("time"), default_seconds=3600)

    is_paid = _to_bool(merged_exam_info.get("ispaid"), default=True)
    fee = parse_price_value(merged_exam_info.get("price"), default_value=Decimal("50"))
    if not is_paid:
        fee = Decimal("0")

    description_lines = [subtitle]
    if subject:
        description_lines.append(f"Subject: {subject}")
    if paper.strip():
        description_lines.append(f"Paper: {paper}")
    if date.strip():
        description_lines.append(f"Date: {date}")
    if full_marks:
        description_lines.append(f"Full Marks: {full_marks}")

    if isinstance(instructions, str):
        instruction_lines = _as_instruction_list(instructions)
    else:
        instruction_lines = instructions or list(DEFAULT_INSTRUCTIONS)
    normalized_instructions = [_to_text(line) for line in instruction_lines if _to_text(line)]
    if not normalized_instructions:
        normalized_instructions = list(DEFAULT_INSTRUCTIONS)

    return {
        "name": title,
        "description": "\n".join(line for line in description_lines if line).strip() or "Imported from file",
        "instructions": "\n".join(normalized_instructions),
        "is_free": not is_paid,
        "fee": Decimal("0") if not is_paid else fee,
        "duration_seconds": duration_seconds,
        "grace_seconds": 120 if exam_type == "subjective" else 60,
        "negative_marking": Decimal("0") if exam_type == "subjective" else Decimal("0.25"),
        "is_active": True,
    }
