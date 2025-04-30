# D3 <-> LangGraph MCP Client Example

This directory contains a JavaScript example demonstrating how to use LangGraph to build an agent that interacts with both a standard LLM (OpenAI) and a custom tool provided by a **remote MCP server**.

## Overview

The `main.js` script sets up a LangGraph workflow that connects to a remote MCP server to utilize its tools:

1.  A user query is sent to an OpenAI model (`gpt-4o`).
2.  If the model decides to use the configured MCP tool (`invokeCubeAgent`), the script connects to the remote MCP server specified in the environment variables using `@modelcontextprotocol/sdk`.
3.  The script authenticates with the remote server using a JWT generated from a shared secret.
4.  It calls the `invokeCubeAgent` tool hosted on the remote server.
5.  It handles potential notifications and progress updates from the remote server.
6.  The tool's result is formatted and sent back to the OpenAI model.
7.  The model generates the final response.
8.  The script takes user input either from a command-line argument or via an interactive prompt.

## Features

*   **LangGraph Workflow:** Uses `StateGraph` to orchestrate LLM and remote tool calls.
*   **Remote MCP Tool Integration:** Connects to and calls tools on a separate MCP server.
*   **JWT Authentication:** Securely connects to the remote MCP server.
*   **Interactive Input:** Prompts the user for input if needed.
*   **Error Handling:** Basic client-side error handling.
*   **Notifications & Progress:** Handles asynchronous updates from the remote server.

## Prerequisites

*   Node.js (v18 or later recommended)
*   Yarn or npm
*   Access to a running MCP server that exposes an `invokeCubeAgent` tool and is configured for JWT (HS256) authentication.

## Client Setup

1.  **Install Dependencies:** Navigate to this directory (`mcp/js`) in your terminal and run:
    ```bash
    yarn install
    # or
    npm install
    ```

2.  **Configure Environment Variables:** Create a file named `.env` in this directory (`mcp/js/.env`). Add the following, ensuring the values match your **remote MCP server's configuration**:

    ```dotenv
    # The full URL of your target REMOTE MCP server's endpoint
    D3_MCP_AGENT_URL=http://your-remote-mcp-server.com/mcp

    # The shared secret key (HS256) used by the REMOTE server for JWT authentication.
    # This client uses the same secret to generate the token.
    D3_MCP_AGENT_SECRET=the_secret_configured_on_your_remote_server

    # Your OpenAI API key for the LangGraph agent
    OPENAI_API_KEY=sk-your_openai_api_key
    ```
    *   **Crucially:** `D3_MCP_AGENT_URL` must point to the correct endpoint of your running remote server, and `D3_MCP_AGENT_SECRET` must exactly match the secret the remote server expects.

## Running the Client

1.  **Ensure Remote MCP Server is Running:** Verify that the remote MCP server (configured in your `.env`) is operational and accessible from where you run this client.

2.  **Run the Client Script:** From this directory (`mcp/js`), execute the script:

    *   **With a command-line query:**
        ```bash
        node main.js "Your query here"
        ```

    *   **Interactively:**
        ```bash
        node main.js 
        ```
        (The script will prompt: `Please enter your query:`) 

## How It Works

*   **`main.js`:** Contains the client-side agent logic.
*   **SDK:** Uses the standard `@modelcontextprotocol/sdk` package.
*   **Authentication:** Generates a JWT using `jsonwebtoken` and the `D3_MCP_AGENT_SECRET`. This token is sent to the remote server via the `StreamableHTTPClientTransport`.
*   **MCP Tool Definition:** Defines a *local* LangChain tool (`mcpTool`) that acts as a wrapper. When invoked by LangGraph, this wrapper:
    *   Creates an MCP `StreamableHTTPClientTransport` and `MCPClient`.
    *   Connects to the remote `D3_MCP_AGENT_URL` using the generated `authToken`.
    *   Calls the *remote* MCP tool (`invokeCubeAgent`) using `client.callTool`.
    *   Processes the response received from the remote server.
*   **Error/Notification Handling:** Includes handlers for client/transport errors and asynchronous messages (`logging/message`, progress updates) sent *from* the remote server.
*   **Cleanup:** Relies on the Node.js process exit for cleanup, avoiding explicit `client.close()` which caused issues.
*   **LangGraph Structure:** Orchestrates the calls between the LLM and the local `mcpTool` wrapper.
*   **Input Handling:** Uses `readline` to get interactive input if no command-line argument is provided.