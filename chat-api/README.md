# Cube Chat API Example

Node.js example for using the Cube Chat API with streaming responses.

## Usage

```bash
CUBE_TENANT_NAME=xxx CUBE_AGENT_ID=yyy CUBE_API_KEY=zzz node chat.js "Your question"
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CUBE_TENANT_NAME` | Yes | - | Your Cube Cloud tenant name or 'localhost' |
| `CUBE_AGENT_ID` | Yes | - | The ID of your AI agent |
| `CUBE_API_KEY` | Yes | - | Your Cube Cloud API key |
| `CUBE_API_URL` | No | `https://{TENANT_NAME}.cubecloud.dev` | Base URL for Cube API endpoints |
| `AI_ENGINEER_URL` | No | `https://ai-engineer.cubecloud.dev` | Base URL for AI Engineer service |
| `DEBUG` | No | - | Set to any value to enable debug logging |

## Features

- Session generation and token authentication
- Streaming chat responses
- Real-time display of:
  - Assistant messages (streamed)
  - Agent thinking process
  - Tool calls and results

## Example Usage

```bash
# Default question
node chat.js

# Custom question
node chat.js "What is the total revenue?"
```

## API Documentation

Full documentation: https://docs.cube.dev/embed/api/chat
