# Cube AI Agent Integration Examples

This repository contains a collection of examples demonstrating how to integrate Cube AI Agents into your applications using the Chat API and advanced workflow orchestration.

## Overview

Cube AI Agents enable you to build intelligent, data-driven applications with natural language interfaces. This repository showcases practical integration patterns from simple chat interfaces to complex multi-step workflows.

## Repository Structure

```
d3_examples/
├── shared/                      # Shared utilities
│   └── cube-agent-client/      # Reusable Cube Agent client library
├── chat-api/                   # Simple chat API example
├── langgraph-analytics/        # LangGraph workflow example
└── react-app/                  # React application example
```

## Examples

### 1. Cube Agent Client Library

**Location**: [shared/cube-agent-client/](shared/cube-agent-client/)

A reusable Node.js client library for interacting with Cube AI Agents. Provides a clean API for session management, authentication, and streaming chat interactions.

**Features**:
- Simple `chat()` and `streamChat()` methods
- Automatic session/token management
- Detailed responses with thinking and tool calls
- Support for Cube Cloud

**Quick Start**:
```javascript
import { CubeAgentClient } from '../shared/cube-agent-client/index.js';

const client = new CubeAgentClient({
  tenantName: 'your-tenant',
  agentId: 1,
  apiKey: 'your-api-key'
});

const response = await client.chat('What is the total revenue?');
```

### 2. Chat API

**Location**: [chat-api/](chat-api/)

A simple Node.js example for using the Cube Chat API with streaming responses. Great starting point for understanding the basics of Cube AI Agent integration.

**Features**:
- Session generation and token authentication
- Streaming chat responses
- Real-time display of assistant messages, thinking process, and tool calls

**Quick Start**:
```bash
cd chat-api
CUBE_TENANT_NAME=xxx CUBE_AGENT_ID=yyy CUBE_API_KEY=zzz node chat.js "Your question"
```

### 3. LangGraph Analytics Workflow

**Location**: [langgraph-analytics/](langgraph-analytics/)

An advanced example demonstrating stateful analytics workflows using **LangGraph.js** and Cube AI Agents. Shows how to build complex, multi-step data analysis workflows with state management, retry logic, and conditional routing.

**Features**:
- Graph-based workflow orchestration
- Stateful execution with persistent memory
- Automatic retry logic for failed queries
- Question classification and intelligent routing
- Multi-step analysis pipeline: Classify → Query → Analyze → Insights

**Workflow**:
```
START → Classify Question → Query Cube → Analyze Results → Generate Insights → END
                              ↓ (retry on error)
                            Query Cube
```

**Quick Start**:
```bash
cd langgraph-analytics
npm install
npm start "What are the top 10 customers by revenue?"
```

**Why LangGraph?**:
LangGraph.js enables cyclic graphs with loops and state management, unlike linear chains in LangChain.js. Perfect for building sophisticated AI agents with complex control flow.

### 4. React App

**Location**: [react-app/](react-app/)

A Next.js React application demonstrating how to integrate Cube AI Agents into a modern web application with streaming chat functionality.

**Features**:
- React-based chat interface
- Streaming responses with real-time updates
- UI components for displaying agent responses

## Getting Started

### Prerequisites

- Node.js 20+
- Access to Cube Cloud
- Cube AI Agent configured

### Environment Variables

All examples support the following environment variables:

```bash
# Required
CUBE_TENANT_NAME=your-tenant-name
CUBE_AGENT_ID=1
CUBE_API_KEY=your-api-key

# Optional (for custom deployments)
CUBE_API_URL=https://your-custom-domain.com
AI_ENGINEER_URL=https://your-ai-engineer-url.com
```

## Example Progression

We recommend exploring the examples in this order:

1. **Start with [chat-api/](chat-api/)** - Learn the basics of Cube AI Agent integration
2. **Review [shared/cube-agent-client/](shared/cube-agent-client/)** - Understand the reusable client library
3. **Explore [langgraph-analytics/](langgraph-analytics/)** - Build complex workflows with state management
4. **Check out [react-app/](react-app/)** - Integrate into a React application

## Use Cases

### Simple Chat Interface
Use the **chat-api** or **cube-agent-client** examples for:
- Basic Q&A interfaces
- Simple data queries
- Prototyping and testing

### Complex Workflows
Use the **langgraph-analytics** example for:
- Multi-step data analysis pipelines
- Stateful conversations with memory
- Conditional logic and branching
- Retry mechanisms and error handling
- Business process automation

### Web Applications
Use the **react-app** example for:
- Interactive dashboards
- BI copilots
- Embedded analytics
- Customer-facing data apps

## API Documentation

- [Cube Chat API](https://docs.cube.dev/embed/api/chat)
- [LangGraph.js Documentation](https://langchain-ai.github.io/langgraphjs/)

## Architecture

### High-Level Flow

```
User Question
     ↓
[Chat API / LangGraph Workflow]
     ↓
Cube Agent Client Library
     ↓
1. Generate Session (Cube API)
2. Get Auth Token (Cube API)
3. Stream Chat (AI Engineer API)
     ↓
Cube AI Agent
     ↓
Response (with thinking, tool calls, results)
```

### Components

- **Cube Agent Client**: Handles authentication and communication
- **LangGraph Workflow**: Orchestrates multi-step analysis
- **Cube AI Agent**: Processes queries and generates insights
- **Tool Calls**: Agent can query data sources, perform calculations, etc.

## Contributing

Each example directory contains its own README with detailed setup instructions and usage examples. Feel free to extend these examples for your specific use cases.

## License

MIT
