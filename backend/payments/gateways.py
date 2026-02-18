import base64
import hashlib
import hmac
import json
from decimal import Decimal
from urllib.parse import urlencode

import requests
from django.conf import settings


class GatewayError(Exception):
    pass


def _digits_only(value):
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def normalize_mobile_number(value):
    raw = str(value or "").strip()
    if raw.startswith("+"):
        normalized = f"+{_digits_only(raw)}"
    else:
        digits = _digits_only(raw)
        country_digits = _digits_only(getattr(settings, "OTP_DEFAULT_COUNTRY_CODE", "+977")) or "977"
        if digits.startswith(country_digits):
            normalized = f"+{digits}"
        elif digits.startswith("0"):
            normalized = f"+{country_digits}{digits[1:]}"
        else:
            normalized = f"+{country_digits}{digits}"
    return normalized


def _esewa_env():
    return (settings.ESEWA_ENV or "sandbox").lower()


def _esewa_base_url():
    if _esewa_env() == "production":
        return "https://epay.esewa.com.np"
    return "https://rc-epay.esewa.com.np"


def esewa_form_url():
    return f"{_esewa_base_url()}/api/epay/main/v2/form"


def esewa_status_url():
    if _esewa_env() == "production":
        return "https://epay.esewa.com.np/api/epay/transaction/status/"
    return "https://rc.esewa.com.np/api/epay/transaction/status/"


def _khalti_env():
    return (settings.KHALTI_ENV or "sandbox").lower()


def _khalti_base_url():
    if _khalti_env() == "production":
        return "https://khalti.com"
    return "https://dev.khalti.com"


def khalti_initiate_url():
    return f"{_khalti_base_url()}/api/v2/epayment/initiate/"


def khalti_lookup_url():
    return f"{_khalti_base_url()}/api/v2/epayment/lookup/"


def _ensure_esewa_config():
    if not settings.ESEWA_PRODUCT_CODE:
        raise GatewayError("ESEWA_PRODUCT_CODE is not configured.")
    if not settings.ESEWA_SECRET_KEY:
        raise GatewayError("ESEWA_SECRET_KEY is not configured.")


def _ensure_khalti_config():
    if not settings.KHALTI_SECRET_KEY:
        raise GatewayError("KHALTI_SECRET_KEY is not configured.")


def esewa_signature(message: str):
    digest = hmac.new(
        settings.ESEWA_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def create_esewa_form_payload(reference_id, total_amount, success_url, failure_url):
    _ensure_esewa_config()
    amount_str = f"{Decimal(total_amount):.2f}"
    message = (
        f"total_amount={amount_str},"
        f"transaction_uuid={reference_id},"
        f"product_code={settings.ESEWA_PRODUCT_CODE}"
    )
    signature = esewa_signature(message)
    return {
        "amount": amount_str,
        "tax_amount": "0",
        "total_amount": amount_str,
        "transaction_uuid": str(reference_id),
        "product_code": settings.ESEWA_PRODUCT_CODE,
        "product_service_charge": "0",
        "product_delivery_charge": "0",
        "success_url": success_url,
        "failure_url": failure_url,
        "signed_field_names": "total_amount,transaction_uuid,product_code",
        "signature": signature,
    }


def verify_esewa_callback_signature(payload):
    _ensure_esewa_config()
    signed_fields = (payload.get("signed_field_names") or "").split(",")
    signed_fields = [field.strip() for field in signed_fields if field.strip()]
    if not signed_fields:
        raise GatewayError("Missing signed_field_names in eSewa callback.")
    message = ",".join(f"{field}={payload.get(field, '')}" for field in signed_fields)
    expected_signature = esewa_signature(message)
    actual_signature = str(payload.get("signature", ""))
    if not hmac.compare_digest(expected_signature, actual_signature):
        raise GatewayError("Invalid eSewa callback signature.")


def check_esewa_status(reference_id, total_amount):
    _ensure_esewa_config()
    params = {
        "product_code": settings.ESEWA_PRODUCT_CODE,
        "total_amount": f"{Decimal(total_amount):.2f}",
        "transaction_uuid": str(reference_id),
    }
    url = esewa_status_url()
    attempts = [
        ("GET", {"params": params}),
        ("POST", {"json": params}),
        ("POST", {"data": params}),
    ]
    last_error = "eSewa status verification failed."

    for method, kwargs in attempts:
        try:
            response = requests.request(method, url, timeout=20, **kwargs)
        except requests.RequestException as exc:
            last_error = str(exc)
            continue

        if response.status_code == 200:
            try:
                return response.json()
            except ValueError:
                last_error = "eSewa status response was not valid JSON."
                continue
        last_error = f"eSewa status check failed ({response.status_code})."

    raise GatewayError(last_error)


def decode_esewa_callback_data(encoded):
    try:
        decoded_bytes = base64.b64decode(encoded)
        return json.loads(decoded_bytes.decode("utf-8"))
    except Exception as exc:
        raise GatewayError("Invalid eSewa callback payload.") from exc


def khalti_initiate(amount_npr, reference_id, return_url, website_url, purchase_name, email, mobile_number, full_name):
    _ensure_khalti_config()
    amount_paisa = int((Decimal(amount_npr) * 100).quantize(Decimal("1")))
    payload = {
        "return_url": return_url,
        "website_url": website_url,
        "amount": amount_paisa,
        "purchase_order_id": str(reference_id),
        "purchase_order_name": purchase_name[:120],
        "customer_info": {
            "name": full_name[:120] if full_name else "Bridge4ER Student",
            "email": email,
            "phone": normalize_mobile_number(mobile_number),
        },
    }
    headers = {
        "Authorization": f"Key {settings.KHALTI_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    response = requests.post(khalti_initiate_url(), json=payload, headers=headers, timeout=20)
    if response.status_code not in {200, 201}:
        try:
            err = response.json()
            message = err.get("detail") or err.get("error_key") or str(err)
        except Exception:
            message = response.text
        raise GatewayError(message or "Khalti initiate request failed.")
    return response.json()


def khalti_lookup(pidx):
    _ensure_khalti_config()
    headers = {
        "Authorization": f"Key {settings.KHALTI_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    response = requests.post(
        khalti_lookup_url(),
        json={"pidx": pidx},
        headers=headers,
        timeout=20,
    )
    if response.status_code not in {200, 201}:
        try:
            err = response.json()
            message = err.get("detail") or err.get("error_key") or str(err)
        except Exception:
            message = response.text
        raise GatewayError(message or "Khalti lookup request failed.")
    return response.json()


def build_frontend_result_url(status_text, gateway, reference_id, exam_set_id=None, message=""):
    base = (settings.FRONTEND_PUBLIC_URL or "").rstrip("/")
    if not base:
        raise GatewayError("FRONTEND_PUBLIC_URL is not configured.")
    path = settings.PAYMENT_RESULT_PATH or "/payment/result"
    if not path.startswith("/"):
        path = f"/{path}"
    params = {"status": status_text, "gateway": gateway, "reference_id": str(reference_id)}
    if exam_set_id:
        params["exam_set_id"] = str(exam_set_id)
    if message:
        params["message"] = message
    return f"{base}{path}?{urlencode(params)}"
