# A2A JSON-RPC Client Example

This directory contains a Python script (`client.py`) demonstrating how to interact with an A2A-compliant agent endpoint using raw JSON-RPC requests.

It covers:
*   Sending `tasks/send` requests.
*   Sending `tasks/sendSubscribe` requests (for streaming responses).
*   Sending `tasks/get` requests to retrieve task results.
*   Generating the required JWT `Authorization` header.

## Prerequisites

*   Python 3.8+
*   An A2A agent endpoint URL.
*   A JWT secret shared with the A2A agent for authentication.

## Setup

1.  **Navigate to this directory:**
    ```bash
    cd a2a/jsonrpc
    ```

2.  **(Recommended)** Create and activate a virtual environment:
    ```bash
    python -m venv .venv
    source .venv/bin/activate
    # On Windows use `.venv\Scripts\activate`
    ```

3.  **Install dependencies using uv:**
    ```bash
    # Make sure you have uv installed: https://github.com/astral-sh/uv
    uv pip install .
    ```

## Environment Variables

The script requires the following environment variables to be set:

```bash
export A2A_AGENT_URL="https://your-a2a-agent.example.com/api/a2a"
export A2A_SECRET="your-jwt-signing-secret"
```

Replace the placeholder values with your actual endpoint and secret.

## Usage

The script can be run using `uv run` via the `jsonrpc-client` script defined in `pyproject.toml`.

```bash
uv run jsonrpc-client <method> <task_id> [options]
```

**Arguments:**
*   `method`: One of `send`, `subscribe`, `get`.
*   `task_id`: An identifier for the task (e.g., `my-test-task-01`).

**Options:**
*   `-m MESSAGE`, `--message MESSAGE`: The text message to send with `send` or `subscribe` methods (defaults to "Hello from JSON-RPC client!").

### Examples

1.  **Send a task (non-streaming):**
    ```bash
    uv run jsonrpc-client send my-first-task -m "Get total sales for last month."
    ```
    This will print the request payload and the final JSON response from the agent.

2.  **Send a task and subscribe to updates (streaming):**
    ```bash
    uv run jsonrpc-client subscribe my-streaming-task -m "Stream me the latest user signups."
    ```
    This will print the request payload and then stream Server-Sent Events (SSE) from the agent as they arrive.

3.  **Get the result of a previously sent task:**
    ```bash
    uv run jsonrpc-client get my-first-task
    ```
    This will retrieve the stored state and result for the task with the ID `my-first-task`.

## How it Works

1.  **JWT Generation:** Reads `A2A_SECRET` and generates a short-lived JWT, adding it to the `Authorization: Bearer <token>` header.
2.  **Payload Construction:** Creates the appropriate JSON-RPC 2.0 request structure based on the chosen method and arguments, including `sessionId` and `metadata.conversation_id`.
3.  **HTTP Request:** Uses the `httpx` library to send the POST request to the `A2A_AGENT_URL`.
4.  **Streaming (for `subscribe`):** Uses `httpx-sse` to handle the Server-Sent Events stream.
5.  **Output:** Prints the request and response (or streamed events) to the console. 