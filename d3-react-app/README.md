# D3 React Chat App

A Next.js React application that demonstrates integration with the D3 AI Agent API for streaming chat functionality.

## Overview

This application provides a modern chat interface that connects to D3's AI Agent API using JWT-based authentication. It features real-time streaming responses, chat history management, and a clean, responsive UI built with React and Tailwind CSS.

## Features

- **Streaming Chat Interface**: Real-time AI responses with streaming support
- **JWT Authentication**: Secure API authentication
- **Chat History**: Persistent chat sessions with unique identifiers
- **Modern UI**: Built with Next.js, React, and Tailwind CSS
- **TypeScript**: Full type safety throughout the application

## Prerequisites

- Node.js 18+ 
- npm or yarn
- D3 API credentials (D3_API_SECRET, D3_API_AGENT_URL)

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/cubedevinc/d3_examples.git
   cd d3_examples/d3-react-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   D3_API_SECRET=your_d3_api_secret_here
   D3_API_AGENT_URL=your_d3_api_agent_url_here
   ```

   **Important**:
   - The `D3_API_AGENT_URL` should be set to the endpoint URL of your D3 agent, which can be found in the Cube Cloud Management Console.
   - The `D3_API_SECRET` is your API secret used for JWT token generation.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## API Integration

The main API integration is located in `app/api/stream-chat-state/route.ts`. This endpoint:

- Accepts chat messages and generates JWT tokens for authentication
- Forwards requests to the D3 Agent API
- Streams responses back to the client in real-time
- Handles error cases and provides appropriate feedback

### Authentication Flow

1. The app generates a JWT token using your `D3_API_SECRET`
2. The token includes user context and expiration (1 hour)
3. Requests are sent to the D3 Agent API with the JWT in the Authorization header
4. The D3 API validates the token and processes the chat request

### Customizing Security Context

You can configure the security context by modifying the `context` key in the JWT token generation. In `app/api/stream-chat-state/route.ts`, the JWT is created with:

```javascript
const authToken = jwt.sign(
  {
    context: { user: 'd3-react-app-client' },
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  },
  secret,
)
```

You can customize the `context` object to include additional security context information as needed for your D3 agent configuration. For example:

```javascript
context: { 
  scope: 'your-scope-here',
}
```

## License

This project is provided as an example and follows the same license as the parent repository. 