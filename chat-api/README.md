# Cube Chat API Example

Node.js example for using the Cube Chat API with streaming responses.

## Usage

```bash
CUBE_TENANT_NAME=xxx CUBE_AGENT_ID=yyy CUBE_API_KEY=zzz node chat.js "Your question"
```

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
