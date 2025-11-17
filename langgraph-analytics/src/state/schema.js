import { Annotation } from "@langchain/langgraph";

/**
 * State schema for the analytics workflow
 * This defines all the data that flows through the graph
 */
export const AnalyticsState = Annotation.Root({
  // User input
  userQuestion: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => ''
  }),

  // Question classification
  questionType: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => 'exploration' // 'exploration' | 'reporting' | 'comparison'
  }),

  // Cube query results
  cubeResults: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),

  // Analysis and insights
  analysis: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => ''
  }),

  insights: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),

  // Conversation history
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),

  // Retry logic
  retryCount: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => 0
  }),

  // Error tracking
  error: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  })
});
