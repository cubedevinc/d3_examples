import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { input, chatId, messageId, loadOnly } = await request.json()

  const authToken = process.env.D3_STREAM_CHAT_AUTH_TOKEN
  const streamChatUrl =
    process.env.NEXT_PUBLIC_D3_STREAM_CHAT_URL ||
    'http://localhost:4201/api/chat/stream-chat-state'

  const apiToken = process.env.D3_STREAM_CHAT_API_TOKEN
  const apiUrl = process.env.D3_STREAM_CHAT_API_URL

  if (!authToken) {
    return NextResponse.json(
      {
        error: 'Missing D3_STREAM_CHAT_AUTH_TOKEN environment variable.',
      },
      { status: 500 },
    )
  }

  const requestBody: any = {
    chatId: String(chatId),
    cubeCredentials: {
      __typename: 'AIEngineerCubeCredentialsDTO',
      apiToken: apiToken,
      apiUrl: apiUrl,
    },
    activeBranchName: 'main',
    isDevMode: false,
    isDefaultBranch: true,
  }

  if (!loadOnly) {
    requestBody.input = input
    requestBody.messageId = messageId || `${Date.now()}-message`
  }

  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  try {
    const response = await fetch(streamChatUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Stream Chat API error: ${response.status} ${errorText}` },
        { status: response.status },
      )
    }

    // Create a readable stream to handle the streaming response
    const stream = new ReadableStream({
      start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                controller.close()
                break
              }
              controller.enqueue(value)
            }
          } catch (error) {
            controller.error(error)
          }
        }

        pump()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Stream Chat API route error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 },
    )
  }
}
