import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { initialMessage, agentId = 18, workbookId = 38 } = await request.json()

  const authToken = process.env.D3_STREAM_CHAT_AUTH_TOKEN
  const chatThreadsUrl =
    process.env.NEXT_PUBLIC_D3_CHAT_THREADS_URL ||
    'http://localhost:4280/api/chat-threads/'

  if (!authToken) {
    return NextResponse.json(
      {
        error: 'Missing D3_STREAM_CHAT_AUTH_TOKEN environment variable.',
      },
      { status: 500 },
    )
  }

  if (!initialMessage) {
    return NextResponse.json(
      {
        error: 'Initial message is required.',
      },
      { status: 400 },
    )
  }

  // Truncate title to reasonable length (e.g., 50 characters)
  const title =
    initialMessage.length > 50
      ? initialMessage.substring(0, 47) + '...'
      : initialMessage

  const requestBody = {
    title: title,
    agentId: agentId,
    meta: {
      initialMessage: initialMessage,
      workbookId: null,
    },
  }

  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  try {
    const response = await fetch(chatThreadsUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Chat Threads API error: ${response.status} ${errorText}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Create Chat Thread API route error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}
