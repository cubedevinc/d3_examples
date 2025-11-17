import { Message, ToolCall, extractChartDataFromToolCall, isChartToolCall } from '@/types/messages'
import { LoaderIcon, Terminal, Wrench, Brain, GitBranch, BarChart3 } from 'lucide-react'
import { useEffect } from 'react'
import { VegaChart } from './vega-chart'

export function Chat({
  messages,
  isLoading,
  setCurrentPreview,
}: {
  messages: Message[]
  isLoading: boolean
  setCurrentPreview: (preview: any) => void
}) {
  useEffect(() => {
    const chatContainer = document.getElementById('chat-container')
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }, [JSON.stringify(messages)])

  const renderToolCall = (toolCall: ToolCall) => {
    let parsedArguments = null
    let parsedResult = null
    
    try {
      if (toolCall.function?.arguments) {
        parsedArguments = JSON.parse(toolCall.function.arguments)
      }
    } catch (e) {
      // If parsing fails, show raw arguments
      parsedArguments = toolCall.function?.arguments
    }
    
    try {
      if (typeof toolCall.result === 'string') {
        parsedResult = JSON.parse(toolCall.result)
      } else {
        parsedResult = toolCall.result
      }
    } catch (e) {
      // If parsing fails, show raw result
      parsedResult = toolCall.result
    }

    // Check if this is a chart tool call
    const chartData = extractChartDataFromToolCall(toolCall)
    const isChart = isChartToolCall(toolCall)

    return (
      <div key={toolCall.id} className="mt-2 p-3 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 mb-2">
          {isChart ? (
            <BarChart3 className="w-4 h-4 text-blue-500" />
          ) : (
            <Wrench className="w-4 h-4 text-blue-500" />
          )}
          <span className="font-medium text-sm">
            {isChart ? 'Chart Generated' : `Tool Call: ${toolCall.function?.name || toolCall.type}`}
          </span>
        </div>
        
        {/* Render chart if this is a chart tool call */}
        {chartData && chartData.vegaSpec && (
          <div className="mb-2">
            <VegaChart
              data={chartData.data}
              schema={chartData.schema}
              vegaSpec={chartData.vegaSpec}
              width={450}
              height={300}
            />
          </div>
        )}

        {/* Show arguments for non-chart tool calls or if requested */}
        {parsedArguments && !isChart && (
          <div className="mb-2">
            <span className="text-xs text-muted-foreground">Arguments:</span>
            <pre className="text-xs bg-background p-2 rounded mt-1 overflow-x-auto">
              {typeof parsedArguments === 'string' 
                ? parsedArguments 
                : JSON.stringify(parsedArguments, null, 2)
              }
            </pre>
          </div>
        )}
        
        {/* Show result for non-chart tool calls in collapsed form */}
        {parsedResult && !isChart && (
          <details className="cursor-pointer">
            <summary className="text-xs text-muted-foreground hover:text-foreground">
              View raw result
            </summary>
            <pre className="text-xs bg-background p-2 rounded mt-1 overflow-x-auto max-h-40">
              {typeof parsedResult === 'string' 
                ? parsedResult 
                : JSON.stringify(parsedResult, null, 2)
              }
            </pre>
          </details>
        )}
      </div>
    )
  }

  const renderThinking = (thinking: string) => {
    if (!thinking) return null
    
    return (
      <div className="mt-2 p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-yellow-600" />
          <span className="font-medium text-sm text-yellow-800 dark:text-yellow-200">Thinking</span>
        </div>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">{thinking}</p>
      </div>
    )
  }

  const renderGraphPath = (graphPath: string[]) => {
    if (!graphPath || graphPath.length === 0) return null
    
    return (
      <div className="mt-2 p-2 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-600" />
          <span className="text-xs text-blue-800 dark:text-blue-200">
            Path: {graphPath.join(' → ')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      id="chat-container"
      className="flex flex-col pb-12 gap-2 overflow-y-auto max-h-full"
    >
      {messages.map((message: Message, index: number) => (
        <div
          className={`flex flex-col px-4 shadow-sm whitespace-pre-wrap ${
            message.role !== 'user' 
              ? 'bg-accent dark:bg-white/5 border text-accent-foreground dark:text-muted-foreground py-4 rounded-2xl gap-4 w-full' 
              : 'bg-gradient-to-b from-black/5 to-black/10 dark:from-black/30 dark:to-black/50 py-2 rounded-xl gap-2 w-fit'
          } font-serif ${message.isInProcess ? 'opacity-75' : ''}`}
          key={message.id || index}
        >
          {/* Message content */}
          {message.content.map((content, id) => {
            if (content.type === 'text') {
              return (
                <div key={id}>
                  {content.text}
                  {message.isDelta && message.isInProcess && (
                    <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                  )}
                </div>
              )
            }
            if (content.type === 'image') {
              return (
                <img
                  key={id}
                  src={content.image}
                  alt="fragment"
                  className="mr-2 inline-block w-12 h-12 object-cover rounded-lg bg-white mb-2"
                />
              )
            }
          })}

          {/* Thinking process */}
          {message.thinking && renderThinking(message.thinking)}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-2">
              {message.toolCalls.map(renderToolCall)}
            </div>
          )}

          {/* Graph path */}
          {message.graphPath && renderGraphPath(message.graphPath)}

          {/* Fragment preview (existing functionality) */}
          {message.object && (
            <div
              onClick={() =>
                setCurrentPreview({
                  fragment: message.object,
                  result: message.result,
                })
              }
              className="py-2 pl-2 w-full md:w-max flex items-center border rounded-xl select-none hover:bg-white dark:hover:bg-white/5 hover:cursor-pointer"
            >
              <div className="rounded-[0.5rem] w-10 h-10 bg-black/5 dark:bg-white/5 self-stretch flex items-center justify-center">
                <Terminal strokeWidth={2} className="text-[#FF8800]" />
              </div>
              <div className="pl-2 pr-4 flex flex-col">
                <span className="font-bold font-sans text-sm text-primary">
                  {message.object?.title || 'Fragment'}
                </span>
                <span className="font-sans text-sm text-muted-foreground">
                  Click to see fragment
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
      {isLoading && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <LoaderIcon strokeWidth={2} className="animate-spin w-4 h-4" />
          <span>Generating...</span>
        </div>
      )}
    </div>
  )
}
