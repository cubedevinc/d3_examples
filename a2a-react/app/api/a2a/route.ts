import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { taskId = 'a2a-react-chat', message } = await request.json()
  const secret = process.env.D3_A2A_SECRET
  const agentUrl = process.env.NEXT_PUBLIC_D3_A2A_AGENT_URL

  if (!secret || !agentUrl) {
    return NextResponse.json(
      {
        error:
          'Missing A2A configuration. Please set D3_A2A_SECRET and NEXT_PUBLIC_D3_A2A_AGENT_URL environment variables.',
      },
      { status: 500 },
    )
  }

  // Generate JWT for authorization (mimicking a2a/common/config.py)
  const tokenPayload = {
    context: { user: 'a2a-react-client' }, // Matches user_context in Python example
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
  }
  const authToken = jwt.sign(tokenPayload, secret, { algorithm: 'HS256' })

  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  // Create JSON-RPC payload for tasks/send (mimicking a2a/common/client.py)
  const sessionId = uuidv4().replace(/-/g, '') // Generate a simple session ID
  const rpcPayload = {
    jsonrpc: '2.0',
    method: 'tasks/send', // Standard A2A send method
    params: {
      id: taskId,
      sessionId: sessionId,
      message: {
        role: 'user',
        parts: [{ type: 'text', text: message, metadata: null }],
        metadata: {},
      },
      metadata: { conversation_id: sessionId }, // Example metadata from Python client
    },
    id: `req-send-${uuidv4().substring(0, 8)}`, // Unique request ID
  }

  try {
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(rpcPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `A2A Agent HTTP error: ${response.status} ${errorText}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    return NextResponse.json(data) // Forward the agent's response
  } catch (error: any) {
    console.error('A2A API route error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}
