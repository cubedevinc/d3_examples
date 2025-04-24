# FastMCP Example for Cube D3

This example demonstrates how to integrate Cube D3 with the Model Context Protocol (MCP) using FastMCP.

## Overview

The FastMCP example provides a simple MCP server that exposes Cube D3 APIs through the MCP protocol:
- Resources for accessing D3 agents and conversations
- Tools for sending messages to agents and fetching more data
- Custom prompts for analyzing agents and conversations

## Installation

Ensure you have the required dependencies:

```bash
pip install mcp-sdk fastmcp python-dotenv httpx pyjwt
```

## Configuration

This example requires the following environment variables:

```
D3_API_URL=https://your-d3-api-endpoint
D3_API_SECRET=your-d3-api-secret
```

You can set these in a `.env` file in the project directory.

## Usage

### Running the Server

To run the MCP server:

```bash
python -m mcp.examples.fastmcp
```

Or with custom host and port:

```bash
python -m mcp.examples.fastmcp --host 0.0.0.0 --port 8888
```

For debug mode:

```bash
python -m mcp.examples.fastmcp --debug
```

### Connecting to the Server

You can connect to this server using any MCP client, including:

1. The MCP Inspector:
   ```bash
   mcp dev http://localhost:8080
   ```

2. Claude Desktop:
   ```bash
   mcp install http://localhost:8080
   ```

3. Any other MCP-compatible client

## Example Interactions

### Accessing Resources

To get all D3 agents:
```
mcp://localhost:8080/agents
```

To get details about a specific agent:
```
mcp://localhost:8080/agents/agent-id-123
```

To get recent conversations:
```
mcp://localhost:8080/conversations
```

### Using Tools

To send a message to an agent:
```json
{
  "agent_id": "agent-id-123",
  "message": "Hello, what can you help me with today?"
}
```

To fetch more conversations:
```json
{
  "limit": 50
}
```

### Using Prompts

To generate an agent analysis:
```
mcp://localhost:8080/prompts/agent_analysis?agent_id=agent-id-123
```

To generate a conversation analysis:
```
mcp://localhost:8080/prompts/conversation_analysis?conversation_id=conv-id-456
```

## Integration with Cube D3

This example demonstrates how MCP can be used to expose and interact with the Cube D3 platform's APIs, allowing LLM agents to:

1. Discover available D3 agents
2. Access conversation history
3. Send messages to D3 agents
4. Generate analyses of D3 agents and conversations
