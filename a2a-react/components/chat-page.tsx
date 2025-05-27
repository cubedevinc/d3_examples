'use client'

import { Chat as D3ChatDisplay } from '@/components/chat'
import { ChatInput as D3ChatInput } from '@/components/chat-input'
import { NavBar } from '@/components/navbar'
import { Message, streamChatMessageToMessage, StreamChatMessage } from '@/types/messages'
import { SetStateAction, useEffect, useState, useCallback } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useRouter } from 'next/navigation'

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

  const loadExistingChat = useCallback(async (existingChatId: string) => {
    try {
      setIsLoadingExistingChat(true)
      setErrorMessage('')
      
      // First, get the chat thread details
      const threadResponse = await fetch(`/api/get-chat-thread/${existingChatId}`)
      if (!threadResponse.ok) {
        throw new Error(`Failed to get chat thread: ${threadResponse.status}`)
      }
      
      const threadData = await threadResponse.json()
      console.log('Chat thread data:', threadData)
      
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

      const decoder = new TextDecoder()
      let buffer = ''
      const loadedMessages: Message[] = []

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
            
            if (streamMsg.id === '__cutoff__') {
              continue
            }
            
            if (streamMsg.id !== '__state__') {
              const message = streamChatMessageToMessage(streamMsg)
              loadedMessages.push(message)
            }
          } catch (error) {
            console.warn('Failed to parse loading message:', line, error)
          }
        }
      }

      loadedMessages.sort((a, b) => (a.sort || 0) - (b.sort || 0))
      setMessages(loadedMessages)

      posthog.capture('chat_loaded', { chat_id: existingChatId })
    } catch (error: any) {
      console.error('Error loading existing chat:', error)
      setErrorMessage(`Failed to load chat: ${error.message}`)
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

  const createNewChatThread = async (initialMessage: string): Promise<string | null> => {
    try {
      setIsCreatingChat(true)
      
      const response = await fetch('/api/create-chat-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialMessage: initialMessage,
          agentId: 18,
          workbookId: 38
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Error creating chat thread: ${response.status}`)
      }

      const data = await response.json()
      console.log('Created chat thread:', data)
      
      const newChatId = data.uuid
      if (!newChatId) {
        throw new Error('No chat ID returned from chat thread creation')
      }

      // Return new Chat ID for further processing
      return newChatId
    } catch (error: any) {
      console.error('Error creating chat thread:', error)
      setErrorMessage(`Failed to create chat thread: ${error.message}`)
      return null
    } finally {
      setIsCreatingChat(false)
    }
  }

  const handleChatSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault()
    if (!chatInput.trim()) return

    const currentInput = chatInput
    setChatInput('')
    setIsLoading(true)
    setErrorMessage('')

    try {
      if (isNewChat || !chatId) {
        // Create new chat thread
        const newChatId = await createNewChatThread(currentInput)
        if (!newChatId) throw new Error('Chat creation failed')

        // Add user message to UI
        const messageId = `${Date.now()}-message`
        const initialUserMessage: Message = {
          role: 'user',
          content: [{ type: 'text', text: currentInput }],
          id: messageId,
          sort: 0,
        }
        setMessages([initialUserMessage])

        // Stream the initial message response
        const response2 = await fetch('/api/stream-chat-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: currentInput,
            chatId: newChatId,
            messageId: messageId,
          }),
        })
        if (!response2.ok) {
          const err = await response2.text()
          throw new Error(`Stream error: ${response2.status} ${err}`)
        }
        const reader2 = response2.body?.getReader()
        const decoder2 = new TextDecoder()
        let buf2 = ''
        while (reader2) {
          const { done, value } = await reader2.read()
          if (done) break
          buf2 += decoder2.decode(value, { stream: true })
          const lines2 = buf2.split('\n')
          buf2 = lines2.pop() || ''
          for (const line of lines2) {
            if (!line.trim()) continue
            try {
              const streamMsg: StreamChatMessage = JSON.parse(line)
              if (streamMsg.id === '__state__' || streamMsg.id === '__cutoff__') continue
              const msg = streamChatMessageToMessage(streamMsg)
              setMessages(prev => {
                const updated = [...prev]
                const idx = updated.findIndex(m => m.id === streamMsg.id)
                if (idx !== -1 && streamMsg.isDelta && updated[idx].content[0].type === 'text') {
                  updated[idx] = { ...updated[idx], content: [{ type: 'text', text: updated[idx].content[0].text + streamMsg.content }], isInProcess: streamMsg.isInProcess, isDelta: streamMsg.isDelta, sort: streamMsg.sort }
                } else if (idx !== -1) {
                  updated[idx] = msg
                } else {
                  updated.push(msg)
                }
                return updated.sort((a, b) => (a.sort || 0) - (b.sort || 0))
              })
            } catch {}
          }
        }
        // Navigate to chat page
        router.push(`/chats/${newChatId}`)
      } else {
        // Send message to existing chat
        const messageId = `${Date.now()}-message`
        const userMessage: Message = {
          role: 'user',
          content: [{ type: 'text', text: currentInput }],
          id: messageId,
          sort: 0
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
              
              if (streamMsg.id === '__state__' || streamMsg.id === '__cutoff__') {
                continue
              }

              const message = streamChatMessageToMessage(streamMsg)

              setMessages(prev => {
                const updated = [...prev]
                const existingIndex = updated.findIndex(m => m.id === streamMsg.id)
                
                if (existingIndex !== -1) {
                  if (streamMsg.isDelta && updated[existingIndex].content[0]?.type === 'text') {
                    updated[existingIndex] = {
                      ...updated[existingIndex],
                      content: [{
                        type: 'text',
                        text: updated[existingIndex].content[0].text + streamMsg.content
                      }],
                      isInProcess: streamMsg.isInProcess,
                      isDelta: streamMsg.isDelta,
                      sort: streamMsg.sort
                    }
                  } else {
                    updated[existingIndex] = message
                  }
                } else {
                  updated.push(message)
                }
                
                return updated.sort((a, b) => (a.sort || 0) - (b.sort || 0))
              })
            } catch (error) {
              console.warn('Failed to parse streaming message:', line, error)
            }
          }
        }

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
    if (isNewChat) return 'Cube D3 Chat (New Thread)'
    return `Cube D3 Chat (Chat ID: ${chatId?.toString().substring(0, 8)}...)`
  }

  return (
    <main className="flex min-h-screen max-h-screen">
      <div className="flex flex-col w-full max-h-full max-w-[800px] mx-auto px-4 overflow-auto">
        <NavBar 
          onClear={handleClearChat} 
          canClear={messages.length > 0} 
          onNewChat={handleNewChat}
        />
        <D3ChatDisplay
          messages={messages}
          isLoading={isLoading || isCreatingChat || isLoadingExistingChat}
          setCurrentPreview={() => {}}
        />
        <D3ChatInput
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
        </D3ChatInput>
      </div>
    </main>
  )
} 