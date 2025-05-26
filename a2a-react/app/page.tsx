'use client'

import { Chat as D3ChatDisplay } from '@/components/chat'
import { ChatInput as D3ChatInput } from '@/components/chat-input'
import { NavBar } from '@/components/navbar'
import { Message as D3Message } from '@/lib/messages'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { ViewType } from '@/components/auth'
import { AuthDialog } from '@/components/auth-dialog'
import { SetStateAction, useEffect, useState, useCallback } from 'react'
import { usePostHog } from 'posthog-js/react'

interface A2AMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Home() {
  const [chatInput, setChatInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [messages, setMessages] = useState<A2AMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  
  const posthog = usePostHog()
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const [authView, setAuthView] = useState<ViewType>('sign_in')
  const { session } = useAuth(setAuthDialog, setAuthView)

  useEffect(() => {
    const chatContainer = document.getElementById('chat-container')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, [messages])

  const handleA2ASubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault()
    if (!chatInput.trim()) return

    const userMessage: A2AMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMessage])
    const currentInput = chatInput
    setChatInput('')
    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/a2a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
        })
      })

      const data = await response.json()

      if (data.error || !response.ok) {
        const errorMsg = data.error?.message || data.error?.error || data.error || `Error: ${response.status} - ${response.statusText}`
        throw new Error(errorMsg)
      }
      
      let assistantText = "Sorry, I couldn't understand the response."
      if (data.result && data.result.response) {
        assistantText = typeof data.result.response === 'string' ? data.result.response : JSON.stringify(data.result.response)
      } else if (typeof data.result === 'string') {
        assistantText = data.result
      } else if (data.message && typeof data.message === 'string') {
         assistantText = data.message
      } else if (Object.keys(data).length > 0) {
         assistantText = JSON.stringify(data)
      }
      
      const assistantMessage: A2AMessage = {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMessage])

      posthog.capture('a2a_proxied_message_sent', { input_length: currentInput.length })

    } catch (err: any) {
      console.error("A2A proxied send error:", err)
      const errorContent = err.message || "Failed to get response from agent."
      setErrorMessage(errorContent)
      const assistantErrorMessage: A2AMessage = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantErrorMessage])
    } finally {
      setIsLoading(false)
    }
  }
  
  const displayMessages: D3Message[] = messages.map(msg => ({
    role: msg.role,
    content: [{ type: 'text', text: msg.content }],
    id: msg.timestamp.toISOString(),
    object: undefined,
    result: undefined,
  }))

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value)
    if (errorMessage) setErrorMessage('')
  }

  function handleFileChange(change: SetStateAction<File[]>) {
    setFiles(change)
  }

  function logout() {
    supabase ? supabase.auth.signOut() : console.warn('Supabase is not initialized')
    posthog.capture('user_logout')
  }
  
  function handleSocialClick(target: 'github' | 'x' | 'discord') {
    if (target === 'github') {
      window.open('https://github.com/e2b-dev/fragments', '_blank')
    } else if (target === 'x') {
      window.open('https://x.com/e2b_dev', '_blank')
    } else if (target === 'discord') {
      window.open('https://discord.gg/U7KEcGErtQ', '_blank')
    }
    posthog.capture(`${target}_social_click`)
  }

  function handleClearChat() {
    setMessages([])
    setChatInput('')
    setFiles([])
    setErrorMessage('')
    setIsLoading(false)
    posthog.capture('a2a_chat_cleared')
  }

  return (
    <main className="flex min-h-screen max-h-screen">
      {supabase && (
        <AuthDialog
          open={isAuthDialogOpen}
          setOpen={setAuthDialog}
          view={authView}
          supabase={supabase}
        />
      )}
      <div className="flex flex-col w-full max-h-full max-w-[800px] mx-auto px-4 overflow-auto">
          <NavBar
            session={session}
            showLogin={() => setAuthDialog(true)}
            signOut={logout}
            onSocialClick={handleSocialClick}
            onClear={handleClearChat}
            canClear={messages.length > 0}
            onUndo={() => {}}
            canUndo={false}
          />
          <D3ChatDisplay
            messages={displayMessages}
            isLoading={isLoading}
            setCurrentPreview={() => {}}
          />
          <D3ChatInput
            retry={handleA2ASubmit}
            isErrored={!!errorMessage}
            errorMessage={errorMessage}
            isLoading={isLoading}
            isRateLimited={false}
            stop={() => setIsLoading(false)}
            input={chatInput}
            handleInputChange={handleSaveInputChange}
            handleSubmit={handleA2ASubmit}
            isMultiModal={false}
            files={files}
            handleFileChange={handleFileChange}
          >
            <div className="text-sm text-muted-foreground p-2">Cube D3 Agent (A2A Proxied)</div>
          </D3ChatInput>
        </div>
    </main>
  )
}
