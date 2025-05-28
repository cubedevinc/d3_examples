'use client'

import { ChatPage } from '@/components/chat-page'
import { useParams } from 'next/navigation'

export default function ChatWithIdPage() {
  const params = useParams()
  const chatId = params.chatId as string

  return <ChatPage chatId={chatId} isNewChat={false} />
} 