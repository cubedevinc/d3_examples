# React Chat App

A Next.js React application that demonstrates integration with Cube AI Agents for streaming chat functionality.

## Overview

This application provides a modern chat interface that connects to Cube AI Agents using the shared [Cube Agent Client library](../shared/cube-agent-client/). It features real-time streaming responses, Vega chart visualization, and a clean, responsive UI built with React and Tailwind CSS.

## Features

- **Streaming Chat Interface**: Real-time AI responses with streaming support
- **Session-based Authentication**: Secure authentication using Cube's session API
- **Shared Library**: Uses the reusable [Cube Agent Client](../shared/cube-agent-client/) library
- **Chart Visualization**: Automatic rendering of Vega charts from agent responses
- **Chat History**: Persistent chat sessions with unique identifiers
- **Modern UI**: Built with Next.js, React, and Tailwind CSS
- **TypeScript**: Full type safety throughout the application

## Prerequisites

- Node.js 18+
- npm or yarn
- Access to Cube Cloud

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/cubedevinc/d3_examples.git
   cd d3_examples/react-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env.local` file in the root directory based on `.env.example`:
   ```env
   CUBE_TENANT_NAME=your-tenant-name
   CUBE_AGENT_ID=your-agent-id
   CUBE_API_KEY=sk-your-api-key
   ```

   **How to get your credentials:**
   - `CUBE_TENANT_NAME`: Your Cube Cloud tenant name
   - `CUBE_AGENT_ID`: Found in the Cube Cloud AI Agents section
   - `CUBE_API_KEY`: Generate an API key in Cube Cloud settings

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## API Integration

The main API integration is located in `app/api/stream-chat-state/route.ts`. This endpoint:

- Uses the shared `CubeAgentClient` library for authentication and communication
- Handles session generation and token management automatically
- Streams responses from the AI agent back to the client in real-time
- Supports chart data visualization through tool calls

### Architecture

```
Browser ──> Next.js API Route ──> CubeAgentClient ──> Cube Cloud
         ←─ (streaming)        ←─ (streaming)      ←─
```

The API route acts as a proxy, using `CubeAgentClient.getRawChatStream()` to stream responses from Cube Cloud directly to the browser without buffering.

### Authentication Flow

1. `CubeAgentClient` generates a session using the Cube API key
2. The session is exchanged for an authentication token
3. The token is used to authenticate requests to the AI Engineer service
4. Tokens are cached and reused for the duration of the chat session

## License

This project is provided as an example and follows the same license as the parent repository. 