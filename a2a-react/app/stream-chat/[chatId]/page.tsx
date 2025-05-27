'use client'

import { Chat as D3ChatDisplay } from '@/components/chat'
import { ChatInput as D3ChatInput } from '@/components/chat-input'
import { NavBar } from '@/components/navbar'
import { Message, parseStreamChatResponse, streamChatMessageToMessage, StreamChatMessage } from '@/lib/messages'
import { SetStateAction, useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useRouter, useParams } from 'next/navigation'

export default function StreamChatWithIdPage() {
  const [chatInput, setChatInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoadingExistingChat, setIsLoadingExistingChat] = useState(false)
  
  const router = useRouter()
  const params = useParams()
  const chatId = params.chatId as string
  const posthog = usePostHog()

  // Load existing chat on component mount
  useEffect(() => {
    if (chatId) {
      loadExistingChat(chatId)
    }
  }, [chatId])

  useEffect(() => {
    const chatContainer = document.getElementById('chat-container')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, [messages])

  const loadExistingChat = async (existingChatId: string) => {
    try {
      setIsLoadingExistingChat(true)
      setErrorMessage('')
      
      // Make a request to get the existing chat state
      const response = await fetch('/api/stream-chat-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: existingChatId,
          loadOnly: true // Flag to indicate we just want to load existing state
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
            
            // Skip cutoff messages
            if (streamMsg.id === '__cutoff__') {
              continue
            }
            
            // Handle regular messages (not state messages)
            if (streamMsg.id !== '__state__') {
              const message = streamChatMessageToMessage(streamMsg)
              loadedMessages.push(message)
            }
          } catch (error) {
            console.warn('Failed to parse loading message:', line, error)
          }
        }
      }

      // Sort loaded messages by sort field and set them
      loadedMessages.sort((a, b) => (a.sort || 0) - (b.sort || 0))
      setMessages(loadedMessages)

      posthog.capture('stream_chat_loaded', { chat_id: existingChatId })
    } catch (error: any) {
      console.error('Error loading existing chat:', error)
      setErrorMessage(`Failed to load chat: ${error.message}`)
    } finally {
      setIsLoadingExistingChat(false)
    }
  }

  const handleStreamChatSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault()
    if (!chatInput.trim()) return

    const messageId = `${Date.now()}-message`
    const userMessage: Message = {
      role: 'user',
      content: [{ type: 'text', text: chatInput }],
      id: messageId,
      sort: 0 // Temporary sort, will be updated by server echo
    }
    
    setMessages(prev => [...prev, userMessage])
    const currentInput = chatInput
    setChatInput('')
    setIsLoading(true)
    setErrorMessage('')

    try {
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
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const streamMsg: StreamChatMessage = JSON.parse(line)
            
            // Skip state and cutoff messages
            if (streamMsg.id === '__state__' || streamMsg.id === '__cutoff__') {
              continue
            }

            // Convert to Message format
            const message = streamChatMessageToMessage(streamMsg)

            setMessages(prev => {
              const updated = [...prev]
              const existingIndex = updated.findIndex(m => m.id === streamMsg.id)
              
              if (existingIndex !== -1) {
                // Update existing message
                if (streamMsg.isDelta && updated[existingIndex].content[0]?.type === 'text') {
                  // Accumulate delta content
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
                  // Replace with final message
                  updated[existingIndex] = message
                }
              } else {
                // Add new message
                updated.push(message)
              }
              
              // Sort all messages by sort field
              return updated.sort((a, b) => (a.sort || 0) - (b.sort || 0))
            })
          } catch (error) {
            console.warn('Failed to parse streaming message:', line, error)
          }
        }
      }

      posthog.capture('stream_chat_message_sent', { 
        input_length: currentInput.length,
        chat_id: chatId 
      })

    } catch (err: any) {
      console.error("Stream chat send error:", err)
      const errorContent = err.message || "Failed to get response from stream chat."
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
    // Navigate to new chat page
    router.push('/stream-chat')
    posthog.capture('stream_chat_new_thread_created')
  }

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value)
    if (errorMessage) setErrorMessage('')
  }

  function handleFileChange(change: SetStateAction<File[]>) {
    setFiles(change)
  }

  function handleClearChat() {
    setMessages([])
    setChatInput('')
    setFiles([])
    setErrorMessage('')
    setIsLoading(false)
    posthog.capture('stream_chat_cleared')
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
          isLoading={isLoading || isLoadingExistingChat}
          setCurrentPreview={() => {}}
        />
        <D3ChatInput
          retry={handleStreamChatSubmit}
          isErrored={!!errorMessage}
          errorMessage={errorMessage}
          isLoading={isLoading || isLoadingExistingChat}
          isRateLimited={false}
          stop={() => setIsLoading(false)}
          input={chatInput}
          handleInputChange={handleSaveInputChange}
          handleSubmit={handleStreamChatSubmit}
          isMultiModal={false}
          files={files}
          handleFileChange={handleFileChange}
        >
          <div className="text-sm text-muted-foreground p-2">
            {isLoadingExistingChat 
              ? 'Loading chat...'
              : `Cube D3 Stream Chat (Chat ID: ${chatId.toString().substring(0, 8)}...)`
            }
          </div>
        </D3ChatInput>
      </div>
    </main>
  )
} 