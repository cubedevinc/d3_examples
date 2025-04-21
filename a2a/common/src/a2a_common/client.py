import httpx
import json
import uuid # Added for payload generation
from httpx_sse import connect_sse, ServerSentEvent
from typing import Any, AsyncIterable, Iterable, Optional, Generator, AsyncGenerator

from .config import get_a2a_headers

# --- Payload Creation Helpers ---

def _create_base_params(task_id: str, session_id: str, message_text: str) -> dict[str, Any]:
    """Creates the common 'params' structure for send/subscribe."""
    return {
        "id": task_id,
        "sessionId": session_id,
        "message": {
            "role": "user",
            "parts": [{"type": "text", "text": message_text, "metadata": None}],
            "metadata": {}
        },
        "metadata": {
            "conversation_id": session_id # Example metadata
        },
    }

def create_send_payload(task_id: str, session_id: str, message_text: str) -> dict[str, Any]:
    """Creates the JSON-RPC payload for the tasks/send method."""
    return {
        "jsonrpc": "2.0",
        "method": "tasks/send",
        "params": _create_base_params(task_id, session_id, message_text),
        "id": f"req-send-{uuid.uuid4().hex[:8]}",
    }

def create_send_subscribe_payload(task_id: str, session_id: str, message_text: str) -> dict[str, Any]:
    """Creates the JSON-RPC payload for the tasks/sendSubscribe method."""
    return {
        "jsonrpc": "2.0",
        "method": "tasks/sendSubscribe",
        "params": _create_base_params(task_id, session_id, message_text),
        "id": f"req-sub-{uuid.uuid4().hex[:8]}",
    }

def create_get_payload(task_id: str) -> dict[str, Any]:
    """Creates the JSON-RPC payload for the tasks/get method."""
    return {
        "jsonrpc": "2.0",
        "method": "tasks/get",
        "params": {"id": task_id},
        "id": f"req-get-{uuid.uuid4().hex[:8]}",
    }

# --- Exceptions (Keep as is) ---

class A2ACommunicationError(Exception):
    """Base exception for A2A client errors."""
    pass

class A2AHttpError(A2ACommunicationError):
    """Exception for HTTP errors during A2A communication."""
    def __init__(self, status_code: int, response_text: str):
        self.status_code = status_code
        self.response_text = response_text
        super().__init__(f"HTTP Error {status_code}: {response_text}")

class A2AStreamError(A2ACommunicationError):
    """Exception for errors during A2A stream processing."""
    pass

# --- Base Client Class ---

class BaseA2AClient:
    """Base client for interacting with an A2A endpoint, including common task methods."""

    def __init__(self, agent_url: str, a2a_secret: str, user_context: str = "a2a-common-client"):
        if not agent_url:
            raise ValueError("agent_url cannot be empty.")
        if not a2a_secret:
            raise ValueError("a2a_secret cannot be empty.")

        self.agent_url = agent_url
        self.a2a_secret = a2a_secret
        self.user_context = user_context
        self.headers = get_a2a_headers(self.a2a_secret, self.user_context)

    # --- Core Communication Methods (Internal/Protected Preferred) ---
    # Consider making post_sync/async and subscribe_sync/async protected (_post_sync etc.)
    # if the specific task methods below are the intended public API.
    # For now, leaving them public.

    def post_sync(self, payload: dict[str, Any], timeout: Optional[float] = 30.0) -> dict[str, Any]:
        """Sends a generic synchronous POST request to the A2A agent."""
        with httpx.Client(headers=self.headers, timeout=timeout) as client:
            try:
                response = client.post(self.agent_url, json=payload)
                response.raise_for_status() # Raise exception for 4xx/5xx status codes
                return response.json()
            except httpx.HTTPStatusError as e:
                raise A2AHttpError(e.response.status_code, e.response.text) from e
            except httpx.RequestError as e:
                raise A2ACommunicationError(f"Request failed: {e}") from e
            except json.JSONDecodeError as e:
                raise A2ACommunicationError(f"Failed to decode JSON response: {e}") from e

    def subscribe_sync(self, payload: dict[str, Any], timeout: Optional[float] = None) -> Generator[ServerSentEvent, None, None]:
        """Establishes a generic synchronous SSE connection and yields events."""
        try:
            with httpx.Client(headers=self.headers, timeout=timeout) as client:
                with connect_sse(client, "POST", self.agent_url, json=payload) as event_source:
                    # Yield all events directly from the source
                    yield from event_source.iter_sse()
        except httpx.RequestError as e:
            raise A2AStreamError(f"SSE Connection Error: {e}") from e
        except Exception as e:
            # Catch other potential errors during streaming
            raise A2AStreamError(f"SSE Error: An unexpected error occurred: {e}") from e

    async def post_async(self, payload: dict[str, Any], timeout: Optional[float] = 30.0) -> dict[str, Any]:
        """Sends a generic asynchronous POST request to the A2A agent."""
        async with httpx.AsyncClient(headers=self.headers, timeout=timeout) as client:
            try:
                response = await client.post(self.agent_url, json=payload)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                raise A2AHttpError(e.response.status_code, e.response.text) from e
            except httpx.RequestError as e:
                raise A2ACommunicationError(f"Request failed: {e}") from e
            except json.JSONDecodeError as e:
                raise A2ACommunicationError(f"Failed to decode JSON response: {e}") from e

    async def subscribe_async(self, payload: dict[str, Any], timeout: Optional[float] = None) -> AsyncGenerator[ServerSentEvent, None]:
        """Establishes a generic asynchronous SSE connection and yields events."""
        sync_client = httpx.Client(headers=self.headers, timeout=timeout)
        try:
            with connect_sse(sync_client, "POST", self.agent_url, json=payload) as event_source:
                async for sse in event_source.aiter_sse():
                    yield sse
        except httpx.RequestError as e:
            sync_client.close()
            raise A2AStreamError(f"SSE Connection Error: {e}") from e
        except Exception as e:
            sync_client.close()
            raise A2AStreamError(f"SSE Error: An unexpected error occurred: {e}") from e
        finally:
            if not sync_client.is_closed:
                sync_client.close()

    # --- Specific Task Methods ---

    def send_task_sync(self, task_id: str, message_text: str, session_id: Optional[str] = None, timeout: Optional[float] = 30.0) -> dict[str, Any]:
        """Synchronously sends a task using the tasks/send method."""
        sid = session_id or uuid.uuid4().hex
        payload = create_send_payload(task_id, sid, message_text)
        return self.post_sync(payload, timeout=timeout)

    async def send_task_async(self, task_id: str, message_text: str, session_id: Optional[str] = None, timeout: Optional[float] = 30.0) -> dict[str, Any]:
        """Asynchronously sends a task using the tasks/send method."""
        sid = session_id or uuid.uuid4().hex
        payload = create_send_payload(task_id, sid, message_text)
        return await self.post_async(payload, timeout=timeout)

    def send_subscribe_sync(self, task_id: str, message_text: str, session_id: Optional[str] = None, timeout: Optional[float] = None) -> Generator[ServerSentEvent, None, None]:
        """Synchronously sends a task and subscribes to updates using tasks/sendSubscribe."""
        sid = session_id or uuid.uuid4().hex
        payload = create_send_subscribe_payload(task_id, sid, message_text)
        # Use yield from to directly pass the generator
        yield from self.subscribe_sync(payload, timeout=timeout)

    async def send_subscribe_async(self, task_id: str, message_text: str, session_id: Optional[str] = None, timeout: Optional[float] = None) -> AsyncGenerator[ServerSentEvent, None]:
        """Asynchronously sends a task and subscribes to updates using tasks/sendSubscribe."""
        sid = session_id or uuid.uuid4().hex
        payload = create_send_subscribe_payload(task_id, sid, message_text)
        # Use async for to iterate and yield each item
        async for sse in self.subscribe_async(payload, timeout=timeout):
            yield sse

    def get_task_sync(self, task_id: str, timeout: Optional[float] = 30.0) -> dict[str, Any]:
        """Synchronously retrieves task details using the tasks/get method."""
        payload = create_get_payload(task_id)
        return self.post_sync(payload, timeout=timeout)

    async def get_task_async(self, task_id: str, timeout: Optional[float] = 30.0) -> dict[str, Any]:
        """Asynchronously retrieves task details using the tasks/get method."""
        payload = create_get_payload(task_id)
        return await self.post_async(payload, timeout=timeout) 