# LangGraph A2A Agent Example

This directory contains a Python script (`graph.py`) demonstrating how to use LangGraph to orchestrate communication between an OpenAI LLM agent and an external A2A-compliant agent endpoint.

## Prerequisites

*   Python 3.8+
*   [uv](https://github.com/astral-sh/uv) (for installation and running)
*   An OpenAI API Key.
*   An A2A agent endpoint URL.
*   A JWT secret shared with the A2A agent for authentication.

## Setup

1.  **Navigate to this directory:**
    ```bash
    cd a2a/langgraph
    ```

2.  **(Recommended)** Create and activate a virtual environment:
    ```bash
    python -m venv .venv
    source .venv/bin/activate
    # On Windows use `.venv\Scripts\activate`
    ```

3.  **Install dependencies using uv:**
    ```bash
    uv pip install .
    ```

## Environment Variables

The script requires the following environment variables to be set:

```bash
export A2A_AGENT_URL="https://your-a2a-agent.example.com/api/a2a"
export A2A_SECRET="your-jwt-signing-secret"
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# Optional: Specify OpenAI model (defaults to gpt-4o-mini)
# export OPENAI_MODEL="gpt-4o"
```

Replace the placeholder values with your actual endpoint, secret, and OpenAI API key.

## Usage

The graph is executed using the `langgraph-a2a` script defined in `pyproject.toml` via `uv run`.

```bash
uv run langgraph-a2a "<your query/prompt>"
```

**Arguments:**
*   The initial query/prompt string for the agent conversation.

### Example

```bash
# Example where LLM might answer directly
uv run langgraph-a2a "Hello, how are you?"

# Example where LLM should delegate to the A2A agent
uv run langgraph-a2a "Get the sales report for Q1."
```

This will:
1.  Invoke the graph with the initial query.
2.  Execute the `call_llm_node`. The LLM decides how to respond.
3.  If the LLM responds directly, the graph ends.
4.  If the LLM responds with `DELEGATE_A2A: ...`, the `should_call_a2a` condition routes to `call_a2a_node`.
5.  The `call_a2a_node` sends the extracted query to the external A2A agent.
6.  The result (or error) from the A2A agent is added to the message history as a `SystemMessage`.
7.  Control returns to `call_llm_node` to process the A2A result.
8.  The LLM generates a final response based on the A2A result.
9.  The graph ends.
10. The script prints the events during the graph execution and the final message history.

## How it Works

1.  **State (`AgentState`):** Manages the list of `messages` (conversation history), the `query_for_a2a` (if delegation is needed), the `a2a_result` text, and any `error`.
2.  **LLM Node (`call_llm_node`):** Uses `ChatOpenAI` with a system prompt instructing it to either answer directly or use the `DELEGATE_A2A: [query]` format. It parses the LLM response to check for the delegation command.
3.  **A2A Node (`call_a2a_node`):** If triggered, takes the `query_for_a2a` from the state, generates a JWT, constructs the `tasks/sendSubscribe` payload, connects to the A2A agent using `httpx_sse`, accumulates text from received events, and adds a `SystemMessage` with the final result/error back to the state's `messages` list.
4.  **Conditional Edge (`should_call_a2a`):** Checks if the `query_for_a2a` field was set by the LLM node. If yes, it routes to `call_a2a_node`; otherwise, it routes to `END`.
5.  **Graph Structure:** `call_llm_node` -> (conditional edge) -> `call_a2a_node` (if needed) -> `call_llm_node` (to process result) -> (conditional edge) -> `END`.
6.  **Execution:** The `run()` function initializes the state with the user's query, uses `app.stream()` to run the graph and print events, and finally prints the complete message history from the final state. 