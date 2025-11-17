# Cube Chat API Example

Node.js example for using the Cube Chat API with streaming responses.

This example uses the [Cube Agent Client library](../shared/cube-agent-client/) for seamless integration with Cube AI Agents.

## Usage

```bash
CUBE_TENANT_NAME=xxx CUBE_AGENT_ID=yyy CUBE_API_KEY=zzz node chat.js "Your question"
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CUBE_TENANT_NAME` | Yes | - | Your Cube Cloud tenant name |
| `CUBE_AGENT_ID` | Yes | - | The ID of your AI agent |
| `CUBE_API_KEY` | Yes | - | Your Cube Cloud API key |
| `CUBE_API_URL` | No | `https://{TENANT_NAME}.cubecloud.dev` | Base URL for Cube API endpoints |
| `AI_ENGINEER_URL` | No | `https://ai-engineer.cubecloud.dev` | Base URL for AI Engineer service |
| `DEBUG` | No | - | Set to any value to enable debug logging |

## Features

- **Shared Library**: Uses the reusable [Cube Agent Client](../shared/cube-agent-client/) library
- **Session Management**: Automatic session generation and token authentication
- **Streaming Responses**: Real-time display of chat responses as they arrive
- **Debug Mode**: View thinking process, tool calls, and full event stream

### Real-time Display

- Assistant messages (streamed character by character)
- Agent thinking process (in DEBUG mode)
- Tool calls and results (in DEBUG mode)

## Example Usage

### Basic Usage

```bash
# Default question
node chat.js

# Custom question
node chat.js "What is the total revenue?"
```

### With Debug Mode

```bash
# See detailed agent activity
DEBUG=1 node chat.js "What are the top 10 customers?"
```

This will display:
- Thinking process: Shows how the agent analyzes your question
- Tool calls: Shows which data sources are queried
- Full event stream: Complete JSON events for debugging

## How It Works

This example demonstrates the simplest way to integrate Cube AI Agents:

1. **Import the Client**: Uses the shared `CubeAgentClient` library
2. **Configure**: Set up with your Cube Cloud credentials
3. **Stream Chat**: Call `streamChat()` with callbacks for real-time output
4. **Display Results**: Show responses as they arrive

## Related Examples

- [Cube Agent Client Library](../shared/cube-agent-client/) - The underlying client library
- [LangGraph Analytics](../langgraph-analytics/) - Advanced stateful workflows with LangGraph.js
- [React App](../react-app/) - React application integration

## API Documentation

Full documentation: https://docs.cube.dev/embed/api/chat
