import os
import datetime
import jwt
from typing import Optional

A2A_AGENT_URL: Optional[str] = os.getenv("A2A_AGENT_URL")
A2A_SECRET: Optional[str] = os.getenv("A2A_SECRET")

def load_a2a_config() -> tuple[str, str]:
    """Loads A2A URL and Secret from environment variables, exiting if not found."""
    agent_url = os.getenv("A2A_AGENT_URL")
    secret = os.getenv("A2A_SECRET")

    if not all([agent_url, secret]):
        print("Error: Required environment variables missing.")
        print("Please set: A2A_AGENT_URL, A2A_SECRET")
        exit(1)

    # Assertions to help the type checker
    assert agent_url is not None
    assert secret is not None

    return agent_url, secret

def generate_auth_token(secret: str, user_context: str = "a2a-common-client") -> str:
    """Generates a JWT authentication token for A2A requests."""
    payload = {
        'context': {'user': user_context},
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    }
    return jwt.encode(payload, secret, algorithm='HS256')

def get_a2a_headers(secret: str, user_context: str = "a2a-common-client") -> dict[str, str]:
    """Generates the standard headers for A2A requests."""
    auth_token = generate_auth_token(secret, user_context)
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    } 