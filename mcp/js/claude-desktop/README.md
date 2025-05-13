# Using Cube D3 with Claude Desktop via MCP

This guide explains how to connect your Cube D3 MCP server to Claude Desktop using the [mcp-remote](https://www.npmjs.com/package/mcp-remote) bridge. This allows you to use Cube D3's agent tools directly from Claude Desktop as an MCP tool provider.

---

## Prerequisites

- **Cube D3 MCP server** running and accessible (see your deployment docs)
- **Claude Desktop** installed ([download & quickstart](https://modelcontextprotocol.io/quickstart/user))
- **Node.js** v18+ installed (required for `npx`)
- Your **D3 MCP AGENT URL** and **D3 MCP AGENT SECRET** (from your Cube D3 deployment)

---

## 1. Generate an Auth Token

Claude Desktop will connect to your Cube D3 MCP server via `mcp-remote`, which requires an authentication token. This token is a JWT signed with your D3 MCP AGENT SECRET.

You can generate the token using a script:

```bash
D3_MCP_AGENT_SECRET=your_secret node generate-auth-token.js
```

Copy the output JWT token for use in the config below.

---

## 2. Configure Claude Desktop

1. **Find your Claude config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - (If it doesn't exist, enable Developer mode in Claude settings and restart Claude.)

2. **Edit the config:** Add your Cube D3 MCP server as follows:

```json
{
  "mcpServers": {
    "cube-dev-d3": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "PASTE_YOUR_D3_MCP_AGENT_URL_HERE",
        "--header",
        "Authorization:Bearer PASTE_YOUR_D3_MCP_JWT_HERE"
      ]
    }
  }
}
```
- Replace `PASTE_YOUR_D3_MCP_AGENT_URL_HERE` with the URL of your Cube D3 MCP server.
- Replace `PASTE_YOUR_D3_MCP_JWT_HERE` with the JWT you generated above.

3. **Save the file and restart Claude Desktop.**
   - On restart, Claude will connect to your Cube D3 MCP server via `mcp-remote`.
   - You should see your Cube D3 tools available in Claude's tool menu (hammer icon).

---

## References
- [mcp-remote npm package](https://www.npmjs.com/package/mcp-remote)
- [Model Context Protocol: Claude Desktop Quickstart](https://modelcontextprotocol.io/quickstart/user)