'use client'

import { Chat as D3ChatDisplay } from '@/components/chat'
import { ChatInput as D3ChatInput } from '@/components/chat-input'
import { NavBar } from '@/components/navbar'
import { Message, parseStreamChatResponse, streamChatMessageToMessage, StreamChatMessage } from '@/lib/messages'
import { SetStateAction, useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { v4 as uuidv4 } from 'uuid'
import { useRouter } from 'next/navigation'

export default function StreamChatPage() {
  const [chatInput, setChatInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  
  const router = useRouter()
  const posthog = usePostHog()

  useEffect(() => {
    const chatContainer = document.getElementById('chat-container')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, [messages])

  const createNewChatThread = async (initialMessage: string): Promise<string | null> => {
    try {
      setIsCreatingChat(true)
      
      // Step 1: Create the chat thread
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

      // Step 2: Send the initial message to populate the chat
      const messageId = `${Date.now()}-message`
      const streamResponse = await fetch('/api/stream-chat-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: initialMessage,
          chatId: newChatId,
          messageId: messageId,
        })
      })

      if (!streamResponse.ok) {
        const errorData = await streamResponse.json()
        throw new Error(errorData.error || `Error sending initial message: ${streamResponse.status}`)
      }

      // Consume the streaming response to ensure the message is processed
      const reader = streamResponse.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          buffer += decoder.decode(value, { stream: true })
          // We don't need to process the content, just consume it
        }
      }

      // Step 3: Navigate to the new chat page with the chat ID
      router.push(`/stream-chat/${newChatId}`)
      
      return newChatId
    } catch (error: any) {
      console.error('Error creating chat thread:', error)
      setErrorMessage(`Failed to create chat thread: ${error.message}`)
      return null
    } finally {
      setIsCreatingChat(false)
    }
  }

  const handleStreamChatSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault()
    if (!chatInput.trim()) return

    const currentInput = chatInput
    setChatInput('')
    setIsLoading(true)
    setErrorMessage('')

    try {
      // For new chats, create a chat thread and navigate to it
      await createNewChatThread(currentInput)
    } catch (err: any) {
      console.error("Stream chat send error:", err)
      const errorContent = err.message || "Failed to create new chat."
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
    setMessages([])
    setChatInput('')
    setFiles([])
    setErrorMessage('')
    setIsLoading(false)
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
          isLoading={isLoading || isCreatingChat}
          setCurrentPreview={() => {}}
        />
        <D3ChatInput
          retry={handleStreamChatSubmit}
          isErrored={!!errorMessage}
          errorMessage={errorMessage}
          isLoading={isLoading || isCreatingChat}
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
            {isCreatingChat 
              ? 'Creating new chat...'
              : 'Cube D3 Stream Chat (New Thread)'
            }
          </div>
        </D3ChatInput>
      </div>
    </main>
  )
} 