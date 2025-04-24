import os
import datetime
import jwt
from typing import Optional, Tuple

def load_mcp_config() -> Tuple[Optional[str], Optional[str]]:
    """Loads MCP URL and Secret from environment variables."""
    agent_url = os.getenv("MCP_AGENT_URL")
    secret = os.getenv("MCP_AGENT_SECRET")
    # Note: Unlike a2a example, we don't exit here if missing,
    # as the calling code handles the checks and potential warnings.
    return agent_url, secret

def generate_jwt_token(secret: str, user_context: str = "mcp-langgraph-client") -> str:
    """Generates a JWT authentication token using the provided secret."""
    payload = {
        'context': {'user': user_context},
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    }
    return jwt.encode(payload, secret, algorithm='HS256')

def get_mcp_headers(secret: str | None, session_id: str | None = None) -> dict[str, str]:
    """Generates headers for MCP requests, including auth and session ID."""
    headers = {
        "Accept": "text/event-stream" # Generally needed for SSE
    }
    if secret:
        try:
            auth_token = generate_jwt_token(secret)
            headers["Authorization"] = f"Bearer {auth_token}"
        except Exception as e:
            # Log or handle JWT generation error if needed, but don't stop header creation
            print(f"Warning: Failed to generate JWT token: {e}")
    if session_id:
        headers["mcp-session-id"] = session_id
    return headers 