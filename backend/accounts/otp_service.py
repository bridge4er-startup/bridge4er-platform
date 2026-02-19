import requests
from django.conf import settings


class OTPServiceError(Exception):
    pass


def _digits_only(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _to_e164(mobile_number: str) -> str:
    raw = str(mobile_number or "").strip()
    if raw.startswith("+"):
        normalized = f"+{_digits_only(raw)}"
    else:
        digits = _digits_only(raw)
        country_digits = _digits_only(settings.OTP_DEFAULT_COUNTRY_CODE)
        if not country_digits:
            country_digits = "977"
        if digits.startswith(country_digits):
            normalized = f"+{digits}"
        elif digits.startswith("0"):
            normalized = f"+{country_digits}{digits[1:]}"
        else:
            normalized = f"+{country_digits}{digits}"

    number_digits = _digits_only(normalized)
    if len(number_digits) < 8 or len(number_digits) > 15:
        raise OTPServiceError("Invalid mobile number format for OTP delivery.")
    return normalized


def send_otp(mobile_number: str):
    provider = (settings.OTP_PROVIDER or "local").lower()
    if provider == "local":
        return {"provider": "local", "status": "pending-local"}

    if provider != "twilio_verify":
        raise OTPServiceError(f"Unsupported OTP provider: {provider}")

    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    service_sid = settings.TWILIO_VERIFY_SERVICE_SID
    if not (account_sid and auth_token and service_sid):
        raise OTPServiceError("Twilio Verify configuration is incomplete.")

    channel = str(getattr(settings, "TWILIO_VERIFY_CHANNEL", "sms") or "sms").strip().lower()
    if channel not in {"sms", "call", "whatsapp"}:
        channel = "sms"

    to_number = _to_e164(mobile_number)
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications"
    response = requests.post(
        url,
        data={"To": to_number, "Channel": channel},
        auth=(account_sid, auth_token),
        timeout=20,
    )
    if response.status_code not in {200, 201}:
        try:
            payload = response.json()
            message = payload.get("message") or payload.get("detail")
        except Exception:
            message = response.text
        raise OTPServiceError(message or "OTP provider request failed.")

    payload = response.json()
    return {
        "provider": "twilio_verify",
        "channel": channel,
        "status": payload.get("status", "pending"),
        "sid": payload.get("sid", ""),
        "to": payload.get("to", to_number),
    }


def verify_otp(mobile_number: str, otp_code: str) -> bool:
    provider = (settings.OTP_PROVIDER or "local").lower()
    if provider == "local":
        return False
    if provider != "twilio_verify":
        raise OTPServiceError(f"Unsupported OTP provider: {provider}")

    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    service_sid = settings.TWILIO_VERIFY_SERVICE_SID
    if not (account_sid and auth_token and service_sid):
        raise OTPServiceError("Twilio Verify configuration is incomplete.")

    to_number = _to_e164(mobile_number)
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck"
    response = requests.post(
        url,
        data={"To": to_number, "Code": str(otp_code or "").strip()},
        auth=(account_sid, auth_token),
        timeout=20,
    )
    if response.status_code not in {200, 201}:
        try:
            payload = response.json()
            message = payload.get("message") or payload.get("detail")
        except Exception:
            message = response.text
        raise OTPServiceError(message or "OTP verification request failed.")

    payload = response.json()
    return str(payload.get("status", "")).lower() == "approved"
