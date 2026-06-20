import requests
from typing import Tuple


def verify_google_token(id_token: str) -> Tuple[str, str]:
    """Verify Google ID token via Google's tokeninfo endpoint.
    Returns (email, name). Raises ValueError if verification fails.
    Handles network errors gracefully.
    """
    try:
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=5,
        )
    except Exception as e:
        raise ValueError(f"Failed to verify token: {e}")
    if resp.status_code != 200:
        raise ValueError("Invalid Google ID token")
    data = resp.json()
    email = data.get("email")
    name = data.get("name", "")
    if not email:
        raise ValueError("Google token missing email")
    return email, name
