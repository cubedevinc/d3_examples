import { IncomingMessage } from 'http'

/**
 * Configuration options for CubeAgentClient
 */
export interface CubeAgentConfig {
  /** Cube tenant name */
  tenantName: string
  /** AI agent ID */
  agentId: string | number
  /** Cube API key */
  apiKey: string
  /** Optional Cube API URL (defaults to https://{tenantName}.cubecloud.dev) */
  cubeApiUrl?: string
  /** Optional AI Engineer URL (defaults to https://ai-engineer.cubecloud.dev) */
  aiEngineerUrl?: string
  /** Optional chat ID (defaults to auto-generated) */
  chatId?: string
}

/**
 * Tool call information from the agent
 */
export interface ToolCall {
  name: string
  input?: any
  output?: any
}

/**
 * Event from the stream chat API
 */
export interface StreamChatEvent {
  id: string
  role: 'user' | 'assistant'
  content?: string
  isDelta?: boolean
  thinking?: string
  toolCall?: ToolCall
  graphPath?: string[]
  isStructuredResponse?: boolean
  isInProcess?: boolean
  sort: number
  state?: {
    messages?: any[]
    isStreaming?: boolean
  }
}

/**
 * Options for streaming chat
 */
export interface StreamChatOptions {
  /** Callback invoked for each content chunk */
  onChunk?: (content: string) => void
  /** Callback invoked for thinking events */
  onThinking?: (thought: string) => void
  /** Callback invoked for tool call events */
  onToolCall?: (tool: ToolCall) => void
}

/**
 * Detailed response from chatDetailed method
 */
export interface ChatDetailedResponse {
  /** Complete assistant response content */
  content: string
  /** Array of thinking steps */
  thinking: string[]
  /** Array of tool calls made during the conversation */
  toolCalls: ToolCall[]
  /** Raw events from the stream */
  rawEvents: StreamChatEvent[]
}

/**
 * Client for interacting with Cube's AI Agent API
 */
export class CubeAgentClient {
  /** Cube tenant name */
  tenantName: string
  /** AI agent ID */
  agentId: string | number
  /** Cube API key */
  apiKey: string
  /** Chat ID for this conversation */
  chatId: string
  /** Cube API URL */
  cubeApiUrl: URL
  /** AI Engineer URL */
  aiEngineerUrl: URL

  /**
   * Create a new CubeAgentClient
   */
  constructor(config: CubeAgentConfig)

  /**
   * Generate a new session
   * @param externalId - External user ID
   * @param userAttributes - User attributes
   * @returns Session ID
   */
  generateSession(externalId?: string, userAttributes?: any[]): Promise<string>

  /**
   * Get authentication token for a session
   * @param sessionId - Session ID
   * @returns Authentication token
   */
  getToken(sessionId: string): Promise<string>

  /**
   * Get the raw HTTP response stream for server-side proxying
   * This is useful for Next.js API routes that need to stream responses to the client
   * @param message - User message
   * @param body - Additional request body fields
   * @returns Raw HTTP response stream
   */
  getRawChatStream(message: string, body?: Record<string, any>): Promise<IncomingMessage>

  /**
   * Stream chat responses from the AI agent
   * @param message - User message
   * @param options - Stream options with callbacks
   * @returns Promise that resolves to array of all events
   */
  streamChat(message: string, options?: StreamChatOptions): Promise<StreamChatEvent[]>

  /**
   * Send a chat message and get the complete response
   * @param message - User message
   * @returns Complete assistant response
   */
  chat(message: string): Promise<string>

  /**
   * Get detailed response including thinking and tool calls
   * @param message - User message
   * @returns Structured response with content, thinking, and tool calls
   */
  chatDetailed(message: string): Promise<ChatDetailedResponse>
}
