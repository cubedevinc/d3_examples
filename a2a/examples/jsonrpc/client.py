import json
import argparse
import asyncio
from typing import Any # Keep Any if needed elsewhere, or remove if not
from dotenv import load_dotenv

load_dotenv()

# Import common components
from common import (
    BaseA2AClient,
    load_a2a_config,
    A2ACommunicationError,
    A2AHttpError,
    A2AStreamError
)

# --- Configuration (uses common function) ---
A2A_AGENT_URL, A2A_SECRET = load_a2a_config()

# --- JWT Generation (Handled by BaseA2AClient) ---
# def generate_auth_token(secret: str) -> str: ... (Removed)
# AUTH_TOKEN = generate_auth_token(A2A_SECRET) # type: ignore (Removed)
# HEADERS = { ... } (Removed)

# --- Request Payloads (Removed - Handled by BaseA2AClient methods) ---
# def get_base_params(...): ...
# def create_send_request(...): ...
# def create_send_subscribe_request(...): ...
# def create_get_request(...): ...

# --- Request Functions (Use BaseA2AClient specific methods) ---
async def send_task(client: BaseA2AClient, task_id: str, message: str):
    # payload = create_send_request(task_id, message) # Removed
    print(f"--- Sending tasks/send request for task {task_id} ---")
    # print(json.dumps(payload, indent=2)) # Removed payload logging
    try:
        # Call the specific client method
        response_data = await client.send_task_async(task_id, message)
        print("\n--- Response ---")
        print(json.dumps(response_data, indent=2))
    except A2AHttpError as e:
        print(f"\n--- HTTP Error ---")
        print(f"Status Code: {e.status_code}")
        print(f"Response: {e.response_text}")
    except A2ACommunicationError as e:
        print(f"\n--- Communication Error ---")
        print(f"An error occurred: {e}")
    except Exception as e: # Catch any other unexpected errors
        print(f"\n--- Unexpected Error ---")
        print(f"An unexpected error occurred: {e}")


async def send_task_subscribe(client: BaseA2AClient, task_id: str, message: str):
    # payload = create_send_subscribe_request(task_id, message) # Removed
    print(f"--- Sending tasks/sendSubscribe request for task {task_id} ---")
    # print(json.dumps(payload, indent=2)) # Removed payload logging
    print("\n--- Streaming Response ---")
    try:
        # Call the specific client method
        async for sse in client.send_subscribe_async(task_id, message):
            if sse.event == "error":
                 print(f"Error Event: {sse.data}")
                 # Decide if we should break or continue based on error type?
                 # For now, just printing.
            elif sse.event == "close":
                 print("Stream Closed by server.")
                 break # Explicitly break on close event
            else: # Default message event
                 print(f"Event Type: {sse.event}")
                 try:
                     print(json.dumps(json.loads(sse.data), indent=2))
                 except json.JSONDecodeError:
                     print(f"Raw Data: {sse.data}") # Print raw if not JSON
                 print("-" * 20)
    except A2AStreamError as e:
         print(f"\n--- Streaming Error ---")
         print(f"Error during streaming: {e}")
    except Exception as e: # Catch any other unexpected errors
        print(f"\n--- Unexpected Error ---")
        print(f"An unexpected error occurred during streaming: {e}")


async def get_task(client: BaseA2AClient, task_id: str):
    # payload = create_get_request(task_id) # Removed
    print(f"--- Sending tasks/get request for task {task_id} ---")
    # print(json.dumps(payload, indent=2)) # Removed payload logging
    try:
        # Call the specific client method
        response_data = await client.get_task_async(task_id)
        print("\n--- Response ---")
        print(json.dumps(response_data, indent=2))
    except A2AHttpError as e:
        print(f"\n--- HTTP Error ---")
        print(f"Status Code: {e.status_code}")
        print(f"Response: {e.response_text}")
    except A2ACommunicationError as e:
        print(f"\n--- Communication Error ---")
        print(f"An error occurred: {e}")
    except Exception as e: # Catch any other unexpected errors
        print(f"\n--- Unexpected Error ---")
        print(f"An unexpected error occurred: {e}")


# --- Main Execution ---
async def main():
    parser = argparse.ArgumentParser(description="Send JSON-RPC requests to an A2A agent using a2a_common.")
    parser.add_argument("-m", "--method", choices=["send", "subscribe", "get"], default="send", help="The RPC method to call.")
    parser.add_argument("-t", "--task-id", default="test-task", help="The ID for the task.")
    parser.add_argument("-s", "--message", default="Hello from JSON-RPC client!", help="Message text for 'send' and 'subscribe' methods.")

    args = parser.parse_args()

    # Create an instance of the common client
    # User context specific to this example
    a2a_client = BaseA2AClient(A2A_AGENT_URL, A2A_SECRET, user_context="jsonrpc-client-example")

    if args.method == "send":
        await send_task(a2a_client, args.task_id, args.message)
    elif args.method == "subscribe":
        await send_task_subscribe(a2a_client, args.task_id, args.message)
    elif args.method == "get":
        await get_task(a2a_client, args.task_id)

# Synchronous wrapper function to be used as the console script entry point
def run():
    asyncio.run(main())