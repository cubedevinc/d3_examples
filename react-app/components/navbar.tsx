'use client'

import Logo from './logo'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Trash, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavBar({
  onClear,
  canClear,
  onNewChat,
}: {
  onClear: () => void
  canClear: boolean
  onNewChat?: () => void
}) {
  const pathname = usePathname()
  
  return (
    <nav className="w-full flex bg-background py-4">
      <div className="flex flex-1 items-center">
        <Link href="/" className="flex items-center gap-2" target="_blank">
          <Logo width={24} height={24} />
          <h1 className="whitespace-pre">Cube Agent Demo App</h1>
        </Link>
      </div>
      <div className="flex items-center gap-1 md:gap-4">
        {onNewChat && pathname.startsWith('/chats') && (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNewChat}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create new chat thread</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                disabled={!canClear}
              >
                <Trash className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <ThemeToggle />
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </nav>
  )
}
