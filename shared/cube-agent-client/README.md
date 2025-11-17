# Cube Agent Client

A Node.js client library for interacting with Cube's AI Agent API. This library provides a simple interface for session management, authentication, and streaming chat interactions with Cube AI agents.

## Installation

Since this is a local package within the examples repository, you can reference it using relative imports:

```javascript
import { CubeAgentClient } from '../shared/cube-agent-client/index.js';
```

## Quick Start

```javascript
import { CubeAgentClient } from '../shared/cube-agent-client/index.js';

// Initialize the client
const client = new CubeAgentClient({
  tenantName: 'your-tenant',
  agentId: 1,
  apiKey: 'your-api-key'
});

// Simple chat
const response = await client.chat('What is the total revenue?');
console.log(response);

// Detailed response with thinking and tool calls
const detailed = await client.chatDetailed('Show me top 10 customers');
console.log('Response:', detailed.content);
console.log('Thinking:', detailed.thinking);
console.log('Tool Calls:', detailed.toolCalls);
```

## Configuration

### Constructor Options

```javascript
const client = new CubeAgentClient({
  tenantName: string,        // Required: Cube tenant name
  agentId: string|number,    // Required: AI agent ID
  apiKey: string,            // Required: Cube API key
  cubeApiUrl: string,        // Optional: Cube API URL (defaults to https://{tenantName}.cubecloud.dev)
  aiEngineerUrl: string,     // Optional: AI Engineer URL (defaults to https://ai-engineer.cubecloud.dev)
  chatId: string             // Optional: Chat session ID (defaults to auto-generated)
});
```

## API Reference

### Methods

#### `chat(message: string): Promise<string>`

Send a message and get the complete response.

```javascript
const response = await client.chat('What is the total revenue?');
console.log(response); // "The total revenue is $1,234,567"
```

#### `chatDetailed(message: string): Promise<Object>`

Get a detailed response including thinking process and tool calls.

```javascript
const response = await client.chatDetailed('Analyze top customers');
console.log(response);
// {
//   content: "Here are the top customers...",
//   thinking: ["Analyzing customer data...", "Sorting by revenue..."],
//   toolCalls: [{ name: "query_cube", input: {...}, output: {...} }],
//   rawEvents: [...]
// }
```

#### `streamChat(message: string, options?: Object): Promise<Array>`

Stream chat responses with optional callbacks.

```javascript
const events = await client.streamChat('Show me revenue trends', {
  onChunk: (content) => process.stdout.write(content),
  onThinking: (thought) => console.log(`[Thinking] ${thought}`),
  onToolCall: (tool) => console.log(`[Tool] ${tool.name}`)
});
```

#### `generateSession(externalId?: string, userAttributes?: Array): Promise<string>`

Manually generate a new session.

```javascript
const sessionId = await client.generateSession('user@example.com', [
  { name: 'role', value: 'admin' }
]);
```

#### `getToken(sessionId: string): Promise<string>`

Get an authentication token for a session.

```javascript
const token = await client.getToken(sessionId);
```

## Examples

### Basic Chat

```javascript
import { CubeAgentClient } from '../shared/cube-agent-client/index.js';

const client = new CubeAgentClient({
  tenantName: process.env.CUBE_TENANT_NAME,
  agentId: process.env.CUBE_AGENT_ID,
  apiKey: process.env.CUBE_API_KEY
});

const response = await client.chat('What is the total revenue?');
console.log(response);
```

### Streaming with Callbacks

```javascript
await client.streamChat('Analyze customer retention', {
  onChunk: (content) => {
    // Display content as it streams
    process.stdout.write(content);
  },
  onThinking: (thought) => {
    // Show agent's thinking process
    console.log(`\n💭 ${thought}`);
  },
  onToolCall: (tool) => {
    // Log tool usage
    console.log(`\n🔧 Tool: ${tool.name}`);
  }
});
```

### Multi-turn Conversation

```javascript
const client = new CubeAgentClient({
  tenantName: process.env.CUBE_TENANT_NAME,
  agentId: process.env.CUBE_AGENT_ID,
  apiKey: process.env.CUBE_API_KEY,
  chatId: 'my-conversation-id' // Reuse same chat ID for conversation context
});

// First message
await client.chat('What is the total revenue?');

// Follow-up message (maintains context)
await client.chat('How does that compare to last year?');
```

### Error Handling

```javascript
try {
  const response = await client.chat('What is the total revenue?');
  console.log(response);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('Could not connect to Cube API. Please check your configuration.');
  } else {
    console.error('Error:', error.message);
  }
}
```

## Local Development

When developing locally, use the following configuration:

```javascript
const client = new CubeAgentClient({
  tenantName: 'localhost',
  agentId: 2,
  apiKey: 'your-local-api-key',
  cubeApiUrl: 'http://localhost:14300',
  aiEngineerUrl: 'http://localhost:4201'
});
```

## How It Works

1. **Session Generation**: Creates an embedded session with Cube Cloud
2. **Token Retrieval**: Exchanges the session for an authentication token
3. **Chat Streaming**: Sends messages to the AI Engineer API and streams responses

The client automatically handles authentication and caches the session/token for subsequent requests.

## Event Types

When streaming, you'll receive events with the following structure:

```javascript
{
  role: 'assistant',
  content: 'text content',
  isDelta: true,           // True for streaming chunks
  isInProcess: false,      // True while processing
  thinking: 'thought',     // Agent's thinking process
  toolCall: {              // Tool usage
    name: 'tool_name',
    input: {...},
    output: {...}
  }
}
```

## License

MIT
