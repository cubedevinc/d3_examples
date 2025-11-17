// Types for the E2B Fragments schema (simplified)
export type FragmentSchema = {
  title?: string
  description?: string
  code?: string
  // Add other fields as needed
}

export type ExecutionResult = {
  success: boolean
  output?: string
  error?: string
  // Add other fields as needed
}

export type MessageText = {
  type: 'text'
  text: string
}

export type MessageCode = {
  type: 'code'
  text: string
}

export type MessageImage = {
  type: 'image'
  image: string
}

// Types for streaming chat state based on actual response
export type StreamChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  graphPath?: string[]
  isStructuredResponse?: boolean
  isInProcess?: boolean
  isDelta?: boolean
  sort: number
  state?: {
    messages?: any[]
    isStreaming?: boolean
  }
  toolCall?: {
    name: string
    input: string
    result?: string
  }
}

export type ToolCall = {
  id: string
  type: string
  function?: {
    name: string
    arguments: string
  }
  result?: any
}

// Chart-related types
export type ChartData = {
  data?: any[]
  schema?: Array<{
    name: string
    columnType: string
  }>
  vegaSpec?: any
}

export type ParsedToolCallResult = {
  data?: any[]
  schema?: Array<{
    name: string
    columnType: string
  }>
  vegaSpec?: any
  [key: string]: any
}

export type Message = {
  role: 'user' | 'assistant'
  content: MessageText[] | MessageCode[] | MessageImage[]
  id?: string
  object?: Partial<FragmentSchema>
  result?: ExecutionResult
  thinking?: string
  graphPath?: string[]
  isStructuredResponse?: boolean
  isInProcess?: boolean
  isDelta?: boolean
  sort?: number
  toolCalls?: ToolCall[]
}

export function toAISDKMessages(messages: Message[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content.map((content) => {
      if (content.type === 'code') {
        return {
          type: 'text',
          text: content.text,
        }
      }

      return content
    }),
  }))
}

export async function toMessageImage(files: File[]) {
  if (files.length === 0) {
    return []
  }

  return Promise.all(
    files.map(async (file) => {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
      return `data:${file.type};base64,${base64}`
    }),
  )
}

export function parseStreamChatResponse(data: string): StreamChatMessage[] {
  const lines = data.split('\n').filter((line) => line.trim())
  const messages: StreamChatMessage[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      messages.push(parsed)
    } catch (error) {
      console.warn('Failed to parse line:', line, error)
    }
  }

  return messages
}

export function extractChartDataFromToolCall(toolCall: ToolCall): ChartData | null {
  if (!toolCall.result || typeof toolCall.result !== 'string') {
    return null;
  }

  try {
    const parsedResult: ParsedToolCallResult = JSON.parse(toolCall.result);
    
    // Check if this is a chart-related tool call with the expected data structure
    if (parsedResult.vegaSpec || parsedResult.data || parsedResult.schema) {
      return {
        data: parsedResult.data,
        schema: parsedResult.schema,
        vegaSpec: parsedResult.vegaSpec
      };
    }
  } catch (error) {
    console.warn('Failed to parse tool call result for chart data:', error);
  }

  return null;
}

export function isChartToolCall(toolCall: ToolCall): boolean {
  return toolCall.function?.name === 'cubeSqlApiWithChart' || 
         toolCall.function?.name === 'cubeSqlApi' ||
         (toolCall.result && extractChartDataFromToolCall(toolCall) !== null);
}

export function streamChatMessageToMessage(
  streamMsg: StreamChatMessage,
): Message {
  const message: Message = {
    role: streamMsg.role,
    content: [{ type: 'text', text: streamMsg.content }],
    id: streamMsg.id,
    thinking: streamMsg.thinking,
    graphPath: streamMsg.graphPath,
    isStructuredResponse: streamMsg.isStructuredResponse,
    isInProcess: streamMsg.isInProcess,
    isDelta: streamMsg.isDelta,
    sort: streamMsg.sort,
  }

  // Handle tool calls - convert from the streaming format to our format
  if (streamMsg.toolCall) {
    const toolCall: ToolCall = {
      id: streamMsg.id,
      type: 'function',
      function: {
        name: streamMsg.toolCall.name,
        arguments: streamMsg.toolCall.input,
      },
    }

    if (streamMsg.toolCall.result) {
      toolCall.result = streamMsg.toolCall.result
    }

    message.toolCalls = [toolCall]
  }

  return message
}
