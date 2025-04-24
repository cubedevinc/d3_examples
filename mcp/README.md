This directory contains examples of how to build MCP clients to interact with Cube D3 agents.

+ - `examples/langgraph`: LangGraph MCP client example.

### Running the LangGraph Example (`examples/langgraph`)

This example demonstrates a LangGraph agent that can use a tool to invoke a remote Cube D3 agent via the Model Context Protocol (MCP) using Server-Sent Events (SSE).

1.  **Navigate** to the `mcp` directory: `cd mcp`
2.  **Install Dependencies:** Ensure the local SDK and example dependencies are installed. Using `uv` with the workspace configuration in `pyproject.toml` is recommended:
    ```bash
    uv pip install -e examples/langgraph
    # This should also pick up the editable install for ../python-sdk
    ```
3.  **Set Environment Variables:**
    *   `export OPENAI_API_KEY='your_openai_key'` (For the LangGraph agent's LLM)
    *   `export MCP_AGENT_URL='http://your_cube_agent_host:port/mcp/...'` (Full URL of the MCP SSE endpoint)
    *   `export MCP_AGENT_SECRET='your_agent_secret'` (Secret used to generate JWT for authentication)
4.  **Run the Client:**
    ```bash
    uv run mcp-langgraph-client
    ```

You can then interact with the LangGraph agent. When appropriate, it will use the `invokeCubeAgent` tool to connect to your remote Cube D3 agent via MCP/SSE and relay the results. 