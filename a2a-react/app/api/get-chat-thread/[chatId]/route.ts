import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } },
) {
  const chatId = params.chatId

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

  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  try {
    const response = await fetch(`${chatThreadsUrl}uuid/${chatId}`, {
      method: 'GET',
      headers: headers,
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
    console.error('Get Chat Thread API route error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}
