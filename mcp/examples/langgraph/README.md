# LangGraph MCP Client Example

This example demonstrates a LangGraph agent interacting with a remote Cube D3 agent via MCP/SSE.

## Prerequisites

1.  **Python:** >=3.12 (as specified in the parent `pyproject.toml`)
2.  **Dependencies:** Ensure dependencies are installed. Navigate to the parent `mcp` directory and run:
    ```bash
    cd ../.. # Go to the mcp directory from examples/langgraph
    uv pip install -e examples/langgraph
    # This installs the example's dependencies and the local MCP SDK
    ```

## Running the Example

1.  **Set Environment Variables:**
    ```bash
    # Required for the LangGraph LLM
    export OPENAI_API_KEY='your_openai_key'

    # Required for connecting to the Cube D3 Agent via MCP
    export MCP_AGENT_URL='http://your_cube_agent_host:port/mcp/...' # Full URL of the MCP SSE endpoint
    export MCP_AGENT_SECRET='your_agent_secret'           # Secret used to generate JWT
    ```

2.  **Run the Script:**
    From within this `mcp/examples/langgraph` directory, run:
    ```bash
    uv run mcp-langgraph-client
    # Note: You might need to run this from the parent 'mcp' directory
    # depending on your uv/Python environment setup.
    # cd ../.. && uv run mcp-langgraph-client
    ```

3.  **Interact:**
    The script will start an interactive chat session. Type your queries for the LangGraph agent. It will decide whether to respond directly or use the `invokeCubeAgent` tool to contact the remote Cube D3 agent.
    Type `quit` or `exit` to end the session. 