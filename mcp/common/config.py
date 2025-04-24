import os
import datetime
import jwt
from typing import Optional, Tuple

D3_API_URL: Optional[str] = os.getenv("D3_API_URL")
D3_API_SECRET: Optional[str] = os.getenv("D3_API_SECRET")

def load_d3_config() -> Tuple[str, str]:
    """Loads D3 API URL and Secret from environment variables, exiting if not found."""
    api_url = os.getenv("D3_API_URL")
    secret = os.getenv("D3_API_SECRET")

    if not all([api_url, secret]):
        print("Error: Required environment variables missing.")
        print("Please set: D3_API_URL, D3_API_SECRET")
        exit(1)

    # Assertions to help the type checker
    assert api_url is not None
    assert secret is not None

    return api_url, secret

def generate_auth_token(secret: str, user_context: str = "mcp-d3-example") -> str:
    """Generates a JWT authentication token for D3 API requests."""
    payload = {
        'context': {'user': user_context},
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    }
    return jwt.encode(payload, secret, algorithm='HS256')

def get_d3_headers(secret: str, user_context: str = "mcp-d3-example") -> dict[str, str]:
    """Generates the standard headers for D3 API requests."""
    auth_token = generate_auth_token(secret, user_context)
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    }
