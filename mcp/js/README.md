# JavaScript MCP Client Example with LangGraph

This example demonstrates a JavaScript client using LangGraph to orchestrate interactions with an LLM (OpenAI) and a remote tool provided by an MCP server. The client uses the local `@modelcontextprotocol/sdk` built from the adjacent SDK directory.

## Prerequisites

1.  **Node.js and Yarn/npm:** Install Node.js (which includes npm). Yarn is used in the examples, but npm works too.

## Setup

1.  **Build the Local MCP SDK:**
    *   Navigate to the adjacent local MCP SDK directory: `cd ../<sdk_directory_name>` (relative to this `mcp/js` directory).
    *   Install its dependencies: `yarn install` (or `npm install`).
    *   Build the SDK: `yarn build` (or `npm run build`).
    *   Navigate back: `cd ../js`.

2.  **Install Client Dependencies:** Install the dependencies for this example (including LangChain, LangGraph, OpenAI, and the *linked* local MCP SDK):
    ```bash
    yarn install 
    # or
    # npm install
    ```
    *(Note: The `package.json` is configured to use `"@modelcontextprotocol/sdk": "file:../<sdk_directory_name>"`).*

3.  **Configure Environment Variables:** Create a `.env` file in this directory (`mcp/js/.env`) and add the following variables:

    ```dotenv
    # URL of the Python MCP Agent server 
    # (e.g., from d3-mcp-client/python-sdk/examples/servers/simple-tool)
    MCP_AGENT_URL=http://localhost:8000/mcp 

    # Secret key used by the Python MCP server to VALIDATE incoming JWTs
    MCP_AGENT_SECRET=your_secret_key_here 

    # OpenAI API Key for the LangGraph agent
    OPENAI_API_KEY=your_openai_api_key_here
    ```
    *   Ensure `MCP_AGENT_URL` points to your running Python MCP server.
    *   `MCP_AGENT_SECRET` is the secret the *server* uses for JWT validation (HS256). The client uses this same secret to *generate* the JWT.
    *   Provide your `OPENAI_API_KEY`.

## Running the Example

1.  **Start the Python MCP Server:** 
    *   Ensure the Python server you want to connect to is running. For example, navigate to `d3-mcp-client/python-sdk/examples/servers/simple-tool`.
    *   Make sure its `.env` file contains the *same* `MCP_AGENT_SECRET` that you put in the JavaScript client's `.env` file.
    *   Start the server (e.g., `python main.py`).

2.  **Run the LangGraph Client:** Execute the client script from the `mcp/js` directory:
    ```bash
    yarn start "Optional: Your query for the agent here"
    # or
    # node langgraph-client.js "Optional: Your query for the agent here"
    ```
    *   If you don't provide a query, it uses a default: "Summarize user signups from the last 7 days.".

## How it Works

*   **`langgraph-client.js`:** Contains the main logic.
*   **Local SDK:** Uses the `@modelcontextprotocol/sdk` linked via a relative file path in `package.json`, requiring the local SDK to be built first.
*   **Authentication:** Generates a JWT using `jsonwebtoken` and the `MCP_AGENT_SECRET` from the `.env` file. This token is sent in the `Authorization: Bearer <token>` header.
*   **MCP Tool Definition:** Uses the `tool()` function from `@langchain/core/tools` to define the `invokeCubeAgent` tool. The tool's execution logic encapsulates:
    *   Creating an MCP `StreamableHTTPClientTransport` and `MCPClient` from the local SDK.
    *   Connecting to the `MCP_AGENT_URL` with the generated `authToken`.
    *   Calling the *remote* MCP tool (`invokeCubeAgent`) with the user's query.
    *   Processing the response (text content or error).
    *   Disconnecting the MCP client.
*   **LangGraph Structure:**
    *   An "Agent State" (implicitly defined) holds `messages`, `llmWithTools`, and `tools`.
    *   `llmWithTools`: An `ChatOpenAI` model instance bound to the `mcpTool`.
    *   `callModel` Node: Retrieves `llmWithTools` from the state and invokes the LLM with the current message history.
    *   `callToolNode` Node: 
        *   Retrieves the `tools` array (containing `mcpTool`) from the state.
        *   Manually iterates through tool calls requested by the LLM.
        *   Invokes the corresponding tool (our `mcpTool`).
        *   Constructs `ToolMessage` objects with the results and correct `tool_call_id`.
    *   `shouldContinue` Edge Logic: Determines flow based on whether the last AI message contained tool calls.
    *   The graph orchestrates the flow, passing the necessary components (`llmWithTools`, `tools`) via state channels between nodes. 