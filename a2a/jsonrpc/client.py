import os
import uuid
import json
import datetime
import argparse
import httpx
import jwt
from httpx_sse import connect_sse
import asyncio

# --- Configuration ---
A2A_AGENT_URL = os.getenv("A2A_AGENT_URL")
A2A_SECRET = os.getenv("A2A_SECRET")

if not all([A2A_AGENT_URL, A2A_SECRET]):
    print("Error: Required environment variables are missing.")
    print("Please set: A2A_AGENT_URL, A2A_SECRET")
    exit(1)

# --- JWT Generation ---
def generate_auth_token(secret: str) -> str:
    payload = {
        'context': {'user': 'jsonrpc-client-example'},
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    }
    return jwt.encode(payload, secret, algorithm='HS256')

# The check above ensures A2A_SECRET is not None here
AUTH_TOKEN = generate_auth_token(A2A_SECRET) # type: ignore
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
}

# --- Request Payloads ---
def get_base_params(task_id: str, message_text: str) -> dict:
    session_id = uuid.uuid4().hex # Generate a session ID for this task
    return {
        "id": task_id,
        "sessionId": session_id, # Added sessionId
        "message": {
            "role": "user",
            "parts": [{"type": "text", "text": message_text, "metadata": None}], # Added metadata: null to part
            "metadata": {} # Added empty metadata to message
        },
        "metadata": {
            "conversation_id": session_id # Added example metadata
        },
    }

def create_send_request(task_id: str, message_text: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "tasks/send",
        "params": get_base_params(task_id, message_text),
        "id": f"req-send-{uuid.uuid4().hex[:8]}",
    }

def create_send_subscribe_request(task_id: str, message_text: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "tasks/sendSubscribe",
        "params": get_base_params(task_id, message_text),
        "id": f"req-sub-{uuid.uuid4().hex[:8]}",
    }

def create_get_request(task_id: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "tasks/get",
        "params": {"id": task_id},
        "id": f"req-get-{uuid.uuid4().hex[:8]}",
    }

# --- Request Functions ---
async def send_task(task_id: str, message: str):
    payload = create_send_request(task_id, message)
    print(f"--- Sending tasks/send request for task {task_id} ---")
    print(json.dumps(payload, indent=2))
    async with httpx.AsyncClient(headers=HEADERS, timeout=None) as client:
        try:
            response = await client.post(A2A_AGENT_URL, json=payload)
            response.raise_for_status()
            print("\n--- Response ---")
            print(json.dumps(response.json(), indent=2))
        except httpx.HTTPStatusError as e:
            print(f"\n--- HTTP Error ---")
            print(f"Status Code: {e.response.status_code}")
            print(f"Response: {e.response.text}")
        except Exception as e:
            print(f"\n--- Error ---")
            print(f"An unexpected error occurred: {e}")

async def send_task_subscribe(task_id: str, message: str):
    payload = create_send_subscribe_request(task_id, message)
    print(f"--- Sending tasks/sendSubscribe request for task {task_id} ---")
    print(json.dumps(payload, indent=2))
    print("\n--- Streaming Response ---")
    try:
        with httpx.Client(headers=HEADERS, timeout=None) as client:
            with connect_sse(client, "POST", A2A_AGENT_URL, json=payload) as event_source:
                for sse in event_source.iter_sse():
                    if sse.event == "error":
                         print(f"Error Event: {sse.data}")
                         break
                    elif sse.event == "close":
                         print("Stream Closed.")
                         break
                    else: # Default message event
                         print(f"Event Type: {sse.event}")
                         try:
                             print(json.dumps(json.loads(sse.data), indent=2))
                         except json.JSONDecodeError:
                             print(f"Raw Data: {sse.data}") # Print raw if not JSON
                         print("-" * 20)

    except httpx.RequestError as e:
         print(f"\n--- HTTP Request Error ---")
         print(f"Error connecting or sending request: {e}")
    except Exception as e:
        print(f"\n--- Error ---")
        print(f"An unexpected error occurred during streaming: {e}")


async def get_task(task_id: str):
    payload = create_get_request(task_id)
    print(f"--- Sending tasks/get request for task {task_id} ---")
    print(json.dumps(payload, indent=2))
    async with httpx.AsyncClient(headers=HEADERS, timeout=None) as client:
        try:
            response = await client.post(A2A_AGENT_URL, json=payload)
            response.raise_for_status()
            print("\n--- Response ---")
            print(json.dumps(response.json(), indent=2))
        except httpx.HTTPStatusError as e:
            print(f"\n--- HTTP Error ---")
            print(f"Status Code: {e.response.status_code}")
            print(f"Response: {e.response.text}")
        except Exception as e:
            print(f"\n--- Error ---")
            print(f"An unexpected error occurred: {e}")

# --- Main Execution ---
async def main():
    parser = argparse.ArgumentParser(description="Send JSON-RPC requests to an A2A agent.")
    parser.add_argument("method", choices=["send", "subscribe", "get"], help="The RPC method to call.")
    parser.add_argument("task_id", help="The ID for the task.")
    parser.add_argument("-m", "--message", default="Hello from JSON-RPC client!", help="Message text for 'send' and 'subscribe' methods.")

    args = parser.parse_args()

    if args.method == "send":
        await send_task(args.task_id, args.message)
    elif args.method == "subscribe":
        await send_task_subscribe(args.task_id, args.message)
    elif args.method == "get":
        await get_task(args.task_id)

# Synchronous wrapper function to be used as the console script entry point
def run():
    asyncio.run(main())