import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { input, chatId, messageId, loadOnly } = await request.json()

  const agentUrl = process.env.D3_API_AGENT_URL
  const secret = process.env.D3_API_SECRET

  if (!agentUrl || !secret) {
    return NextResponse.json(
      {
        error:
          'Missing D3_API_AGENT_URL or D3_API_SECRET environment variable.',
      },
      { status: 500 },
    )
  }

  // Generate JWT for A2A authentication
  const authToken = jwt.sign(
    {
      context: { user: 'a2a-common-client' },
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    secret,
  )

  const requestBody: any = {
    chatId: String(chatId),
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
    const response = await fetch(agentUrl, {
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
