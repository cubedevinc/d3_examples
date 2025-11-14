import { NextRequest, NextResponse } from 'next/server'
import { CubeAgentClient } from '@cube-agent-client'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { input, chatId } = await request.json()

  const tenantName = process.env.CUBE_TENANT_NAME
  const agentId = process.env.CUBE_AGENT_ID
  const apiKey = process.env.CUBE_API_KEY
  const cubeApiUrl = process.env.CUBE_API_URL
  const aiEngineerUrl = process.env.AI_ENGINEER_URL

  if (!tenantName || !agentId || !apiKey) {
    return NextResponse.json(
      {
        error:
          'Missing required environment variables: CUBE_TENANT_NAME, CUBE_AGENT_ID, CUBE_API_KEY',
      },
      { status: 500 },
    )
  }

  try {
    // Create Cube Agent client
    const client = new CubeAgentClient({
      tenantName,
      agentId,
      apiKey,
      cubeApiUrl,
      aiEngineerUrl,
      chatId: String(chatId)
    })

    // Get raw Node.js stream from the agent
    const nodeStream = await client.getRawChatStream(input)

    // Check for error status
    if (nodeStream.statusCode && nodeStream.statusCode >= 400) {
      let errorBody = ''
      for await (const chunk of nodeStream) {
        errorBody += chunk.toString()
      }
      return NextResponse.json(
        { error: `Stream Chat API error: ${nodeStream.statusCode} ${errorBody}` },
        { status: nodeStream.statusCode },
      )
    }

    // Convert Node.js IncomingMessage to Web API ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk)
        })

        nodeStream.on('end', () => {
          controller.close()
        })

        nodeStream.on('error', (error: Error) => {
          controller.error(error)
        })
      },
      cancel() {
        nodeStream.destroy()
      }
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
