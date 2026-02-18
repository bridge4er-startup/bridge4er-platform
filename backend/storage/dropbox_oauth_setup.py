"""One-time Dropbox OAuth helper to generate and persist refresh tokens.

Usage:
    backend\\venv\\Scripts\\python.exe backend\\storage\\dropbox_oauth_setup.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

from dotenv import load_dotenv
from dropbox import DropboxOAuth2FlowNoRedirect

DEFAULT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def _mask_secret(secret: str) -> str:
    if len(secret) <= 12:
        return "*" * len(secret)
    return f"{secret[:6]}...{secret[-6:]}"


def _read_env_value(key: str, env_lines: list[str]) -> str:
    prefix = f"{key}="
    for line in env_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        normalized = stripped.replace(" ", "", 1) if " =" in stripped else stripped
        if normalized.startswith(prefix):
            return normalized.split("=", 1)[1].strip()
    return ""


def _upsert_env_value(key: str, value: str, env_lines: list[str]) -> list[str]:
    updated = False
    output: list[str] = []
    for line in env_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            output.append(line)
            continue
        env_key = stripped.split("=", 1)[0].strip() if "=" in stripped else ""
        if env_key == key:
            output.append(f"{key}={value}")
            updated = True
        else:
            output.append(line)

    if not updated:
        if output and output[-1].strip():
            output.append("")
        output.append(f"{key}={value}")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate Dropbox refresh token and store it in backend/.env."
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Path to env file (default: backend/.env).",
    )
    parser.add_argument("--app-key", default="", help="Dropbox app key override.")
    parser.add_argument("--app-secret", default="", help="Dropbox app secret override.")
    parser.add_argument("--auth-code", default="", help="Authorization code (optional).")
    parser.add_argument(
        "--print-only",
        action="store_true",
        help="Do not write .env, only print masked token.",
    )
    args = parser.parse_args()

    env_path = Path(args.env_file).resolve()
    if not env_path.exists():
        raise SystemExit(f"Env file not found: {env_path}")

    load_dotenv(env_path, override=False)
    env_lines = env_path.read_text(encoding="utf-8").splitlines()

    app_key = (args.app_key or "").strip() or _read_env_value("DROPBOX_APP_KEY", env_lines)
    app_secret = (args.app_secret or "").strip() or _read_env_value("DROPBOX_APP_SECRET", env_lines)
    if not app_key or not app_secret:
        raise SystemExit(
            "DROPBOX_APP_KEY and DROPBOX_APP_SECRET are required. "
            "Set them in backend/.env or pass --app-key and --app-secret."
        )

    flow = DropboxOAuth2FlowNoRedirect(app_key, app_secret, token_access_type="offline")
    authorize_url = flow.start()
    print("1) Open this URL and approve the app:")
    print(authorize_url)

    auth_code = (args.auth_code or "").strip()
    if not auth_code:
        auth_code = input("2) Paste the Dropbox authorization code here: ").strip()
    if not auth_code:
        raise SystemExit("Authorization code is required.")

    try:
        oauth_result = flow.finish(auth_code)
    except Exception as exc:
        raise SystemExit(f"Failed to finish Dropbox OAuth flow: {exc}") from exc

    refresh_token = (oauth_result.refresh_token or "").strip()
    if not refresh_token:
        raise SystemExit(
            "Dropbox did not return a refresh token. "
            "Make sure the app allows offline access and try again."
        )

    print(f"Generated refresh token: {_mask_secret(refresh_token)}")
    print("Access token rotation is now automatic when refresh mode is configured.")

    if args.print_only:
        print("Skipped writing to .env because --print-only was used.")
        return 0

    updated = _upsert_env_value("DROPBOX_REFRESH_TOKEN", refresh_token, env_lines)
    updated = _upsert_env_value("DROPBOX_APP_KEY", app_key, updated)
    updated = _upsert_env_value("DROPBOX_APP_SECRET", app_secret, updated)
    env_path.write_text("\n".join(updated) + "\n", encoding="utf-8")
    print(f"Saved DROPBOX_REFRESH_TOKEN to: {env_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
