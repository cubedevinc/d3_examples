'use client'

import { Chat as ChatDisplay } from '@/components/chat'
import { ChatInput } from '@/components/chat-input'
import { NavBar } from '@/components/navbar'
import { Message, streamChatMessageToMessage, StreamChatMessage } from '@/types/messages'
import { useEffect, useState, useCallback, useRef } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

interface ChatPageProps {
  chatId?: string
  isNewChat?: boolean
}

export function ChatPage({ chatId, isNewChat = false }: ChatPageProps) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [isLoadingExistingChat, setIsLoadingExistingChat] = useState(false)

  const router = useRouter()
  const posthog = usePostHog()

  // Track which chat IDs we've already started loading to prevent duplicates
  // This is important for React 18 Strict Mode which runs effects twice in development
  // Using an object instead of Set for Next.js/Turbopack compatibility
  const loadedChatsRef = useRef<Record<string, boolean>>({})

  const loadExistingChat = useCallback(async (existingChatId: string) => {
    // Prevent duplicate loading (React 18 Strict Mode runs effects twice)
    if (loadedChatsRef.current[existingChatId]) {
      return
    }
    loadedChatsRef.current[existingChatId] = true

    try {
      setIsLoadingExistingChat(true)
      setErrorMessage('')
      
      // Check for initial message in localStorage
      const storedInitial = localStorage.getItem(`initialMessage:${existingChatId}`)
      if (storedInitial) {
        localStorage.removeItem(`initialMessage:${existingChatId}`)
        // Add initial user message to UI
        const timestamp = Date.now()
        const messageId = `${timestamp}-message`
        const initialUserMessage: Message = {
          role: 'user',
          content: [{ type: 'text', text: storedInitial }],
          id: messageId,
          sort: 1, // Use a low sort value so it appears first
        }
        setMessages([initialUserMessage])

        // Stream the initial message response
        const response = await fetch('/api/stream-chat-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: storedInitial,
            chatId: existingChatId,
            messageId: messageId,
          }),
        })
        if (!response.ok) {
          throw new Error(`Stream error: ${response.status}`)
        }
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body reader available')
        }
        await iterateStream(reader, (msg) => {
          if (msg.id === '__state__') return
          // Skip user messages from stream since we already added it locally
          if (msg.role === 'user') return
          upsertMessageFromStream(msg)
        })
        posthog.capture('chat_loaded', { chat_id: existingChatId })
        return
      }
      
      
      // Check if this is a new chat that needs initialization
      const response = await fetch('/api/stream-chat-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: existingChatId,
          loadOnly: true
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to load chat: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body reader available')
      }

      await iterateStream(reader, (msg) => {
        if (msg.id === '__state__') return
        // Skip user messages since they should already be in the chat history
        if (msg.role === 'user') return
        upsertMessageFromStream(msg)
      })

      posthog.capture('chat_loaded', { chat_id: existingChatId })
    } catch (error: any) {
      console.error('Error loading existing chat:', error)
      setErrorMessage(`Failed to load chat: ${error.message}`)
      // Remove from loaded set on error so user can retry
      delete loadedChatsRef.current[existingChatId]
    } finally {
      setIsLoadingExistingChat(false)
    }
  }, [posthog])

  // Load existing chat on component mount if chatId is provided
  useEffect(() => {
    if (chatId && !isNewChat) {
      loadExistingChat(chatId)
    }
  }, [chatId, isNewChat, loadExistingChat])

  useEffect(() => {
    const chatContainer = document.getElementById('chat-container')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, [messages])

  const handleChatSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault()
    if (!chatInput.trim()) return

    const currentInput = chatInput
    setChatInput('')
    setIsLoading(true)
    setErrorMessage('')

    try {
      if (isNewChat || !chatId) {
        // New chat: generate a UUID, store initial message, and navigate
        const newChatId = uuidv4()
        localStorage.setItem(`initialMessage:${newChatId}`, currentInput)
        posthog.capture('chat_new_thread_created', { chat_id: newChatId })
        router.push(`/chats/${newChatId}`)
        return
      } else {
        // Send message to existing chat
        const timestamp = Date.now()
        const messageId = `${timestamp}-message`

        // Use a sort value that ensures this message appears after existing ones
        // but will be properly ordered when server response arrives
        const maxSort = Math.max(...messages.map(m => m.sort || 0), 0)
        const userMessage: Message = {
          role: 'user',
          content: [{ type: 'text', text: currentInput }],
          id: messageId,
          sort: maxSort + 1
        }

        setMessages(prev => [...prev, userMessage])

        const response = await fetch('/api/stream-chat-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: currentInput,
            chatId: chatId,
            messageId: messageId,
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || `Error: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body reader available')
        }

        await iterateStream(reader, (msg) => {
          if (msg.id === '__state__') return
          // Skip user messages since we already added it locally
          if (msg.role === 'user') return
          upsertMessageFromStream(msg)
        })

        posthog.capture('chat_message_sent', { 
          input_length: currentInput.length,
          chat_id: chatId 
        })
      }
    } catch (err: any) {
      console.error("Chat send error:", err)
      const errorContent = err.message || "Failed to send message."
      setErrorMessage(errorContent)
      
      const assistantErrorMessage: Message = {
        role: 'assistant',
        content: [{ type: 'text', text: errorContent }],
        id: `error-${Date.now()}`,
        sort: Date.now()
      }
      setMessages(prev => [...prev, assistantErrorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewChat = () => {
    if (isNewChat) {
      // Already on new chat page, just clear
      setMessages([])
      setChatInput('')
      setErrorMessage('')
      setIsLoading(false)
    } else {
      // Navigate to new chat page
      router.push('/chats')
    }
    posthog.capture('chat_new_thread_created')
  }

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value)
    if (errorMessage) setErrorMessage('')
  }

  function handleClearChat() {
    setMessages([])
    setChatInput('')
    setErrorMessage('')
    setIsLoading(false)
    posthog.capture('chat_cleared')
  }

  const getStatusText = () => {
    if (isLoadingExistingChat) return 'Loading chat...'
    if (isCreatingChat) return 'Creating new chat...'
    if (isNewChat) return 'Cube Agent Chat (New Thread)'
    return `Cube Agent Chat (Chat ID: ${chatId?.toString().substring(0, 8)}...)`
  }

  // Helper: read streaming response and feed each parsed StreamChatMessage to a callback
  const iterateStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onStreamMsg: (msg: StreamChatMessage) => void,
  ) => {
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const streamMsg: StreamChatMessage = JSON.parse(line)
          if (streamMsg.id === '__state__' || streamMsg.id === '__cutoff__') continue
          onStreamMsg(streamMsg)
        } catch (err) {
          console.warn('Failed to parse streaming message:', line, err)
        }
      }
    }
  }

  // Helper: upsert a message coming from the stream into component state
  const upsertMessageFromStream = useCallback((streamMsg: StreamChatMessage) => {
    const msg = streamChatMessageToMessage(streamMsg)
    setMessages(prev => {
      const updated = [...prev]
      const idx = updated.findIndex(m => m.id === streamMsg.id)
      if (idx !== -1) {
        if (
          streamMsg.isDelta &&
          updated[idx].content[0]?.type === 'text' &&
          !streamMsg.toolCall // Don't accumulate delta for tool calls
        ) {
          // Accumulate delta text for regular messages
          updated[idx] = {
            ...updated[idx],
            content: [
              {
                type: 'text',
                text: updated[idx].content[0].text + streamMsg.content,
              },
            ],
            isInProcess: streamMsg.isInProcess,
            isDelta: streamMsg.isDelta,
            sort: streamMsg.sort,
          }
        } else {
          // Replace entire message (important for tool calls with results)
          updated[idx] = msg
        }
      } else {
        updated.push(msg)
      }
      return updated.sort((a, b) => (a.sort || 0) - (b.sort || 0))
    })
  }, [])

  return (
    <main className="flex min-h-screen max-h-screen">
      <div className="flex flex-col w-full max-h-full max-w-[800px] mx-auto px-4 overflow-auto">
        <NavBar 
          onClear={handleClearChat} 
          canClear={messages.length > 0} 
          onNewChat={handleNewChat}
        />
        <ChatDisplay
          messages={messages}
          isLoading={isLoading || isCreatingChat || isLoadingExistingChat}
          setCurrentPreview={() => {}}
        />
        <ChatInput
          retry={handleChatSubmit}
          isErrored={!!errorMessage}
          errorMessage={errorMessage}
          isLoading={isLoading || isCreatingChat || isLoadingExistingChat}
          isRateLimited={false}
          stop={() => setIsLoading(false)}
          input={chatInput}
          handleInputChange={handleSaveInputChange}
          handleSubmit={handleChatSubmit}
        >
          <div className="text-sm text-muted-foreground p-2">
            {getStatusText()}
          </div>
        </ChatInput>
      </div>
    </main>
  )
} 