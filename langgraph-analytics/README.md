# LangGraph Analytics Workflow

A stateful analytics workflow powered by **LangGraph.js** and **Cube AI Agents**. This example demonstrates how to build complex, multi-step data analysis workflows using graph-based orchestration.

## What is LangGraph.js?

LangGraph.js is a low-level orchestration framework for building stateful, multi-agent AI applications as graphs. Unlike linear chains in LangChain.js, LangGraph enables:

- **Stateful workflows** with persistent memory across steps
- **Cyclic graphs** with loops and conditional branching
- **Retry logic** and error handling at the node level
- **Complex control flow** for sophisticated agent behaviors

## This Workflow

This example creates an analytics assistant that processes user questions through a multi-step workflow:

```
START → Classify Question → Query Cube → Analyze Results → Generate Insights → END
                              ↓ (retry on error)
                            Query Cube
```

### Workflow Steps

1. **Classify Question**: Determines the type of analysis (exploration, reporting, comparison)
2. **Query Cube**: Calls the Cube AI Agent with automatic retry logic (max 3 attempts)
3. **Analyze Results**: Processes the Cube response based on question type
4. **Generate Insights**: Creates actionable insights from the analysis

### Features

- **State Management**: Tracks question type, results, insights throughout the workflow
- **Automatic Retries**: Retries failed Cube queries up to 3 times
- **Conditional Routing**: Different paths based on question type and success/failure
- **Error Handling**: Graceful degradation and clear error messages

## Prerequisites

- Node.js 20+
- Access to Cube Cloud or local Cube instance
- Cube AI Agent configured

## Installation

```bash
cd langgraph-analytics
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Cube Cloud
CUBE_TENANT_NAME=your-tenant
CUBE_AGENT_ID=1
CUBE_API_KEY=your-api-key
```

## Usage

### Basic Usage

```bash
npm start
```

This runs with the default question: "What is the total revenue?"

### Custom Questions

```bash
npm start "What are the top 10 customers by revenue?"
npm start "Compare revenue vs last year"
npm start "Show me a summary report of sales"
```

### Development Mode

Use watch mode for automatic reloading during development:

```bash
npm run dev "Your question here"
```

## Example Output

```
╔══════════════════════════════════════════════════════════╗
║   LangGraph Analytics Workflow                           ║
║   Powered by Cube AI Agents                              ║
╚══════════════════════════════════════════════════════════╝

📝 Question: "What is the total revenue?"
🏢 Tenant: your-tenant
🤖 Agent: 1

📈 Building analytics workflow graph...

✓ Graph structure:
  START → classify → cube_query → analyze → insights → END
                       ↓ (retry)
                     cube_query

🚀 Starting workflow execution...

═══════════════════════════════════════════════════════════

🔍 Classifying question...
   Type: exploration

📊 Querying Cube agent...
   ✓ Query successful
   💭 Thinking: Analyzing revenue metrics...
   🔧 Used 2 tool(s)

🔬 Analyzing results...
   Type: exploration
   ✓ Analysis complete

💡 Generating insights...
   ✓ Generated 3 insight(s)
   1. Exploration insight: Identify patterns and trends in the data
   2. Consider drilling down into interesting dimensions
   3. Data was retrieved using 2 data source(s)

═══════════════════════════════════════════════════════════

✅ Workflow completed successfully!

📊 Results:
─────────────────────────────────────────────────────────

💬 Response:
The total revenue is $1,234,567.89

🔬 Analysis:
Exploratory analysis: The total revenue is $1,234,567.89...

💡 Insights:
   1. Exploration insight: Identify patterns and trends in the data
   2. Consider drilling down into interesting dimensions
   3. Data was retrieved using 2 data source(s)

─────────────────────────────────────────────────────────

📝 Question Type: exploration
🔄 Retry Count: 0
💬 Messages: 4

═══════════════════════════════════════════════════════════
```

## Project Structure

```
langgraph-analytics/
├── src/
│   ├── index.js              # Main entry point
│   ├── graph.js              # Graph definition and compilation
│   ├── nodes/                # Workflow nodes
│   │   ├── classifyQuestion.js
│   │   ├── cubeQuery.js
│   │   ├── analyzeResults.js
│   │   └── generateInsights.js
│   └── state/
│       └── schema.js         # State schema definition
├── package.json
├── .env.example
└── README.md
```

## How It Works

### State Management

The workflow maintains state across all nodes using the `AnalyticsState` schema:

```javascript
{
  userQuestion: string,        // User's input
  questionType: string,        // 'exploration' | 'reporting' | 'comparison'
  cubeResults: object,         // Response from Cube
  analysis: string,            // Analysis summary
  insights: array,             // Generated insights
  messages: array,             // Conversation history
  retryCount: number,          // Retry attempts
  error: string               // Error message if any
}
```

### Conditional Logic

The workflow uses conditional edges for intelligent routing:

```javascript
graph.addConditionalEdges(
  "cube_query",
  (state) => {
    if (state.error && state.retryCount > 0 && state.retryCount <= 3) {
      return "cube_query"; // Retry
    }
    if (state.error && state.retryCount > 3) {
      return END; // Failed permanently
    }
    return "analyze"; // Success
  }
);
```

### Using the Cube Agent Client

The workflow uses the shared `CubeAgentClient` library:

```javascript
import { CubeAgentClient } from '../../shared/cube-agent-client/index.js';

const client = new CubeAgentClient(config);
const response = await client.chatDetailed(question);
```

## Extending the Workflow

### Adding New Nodes

1. Create a new node file in `src/nodes/`:

```javascript
// src/nodes/myNewNode.js
export async function myNewNode(state) {
  // Process state
  return {
    // Updated state fields
  };
}
```

2. Add the node to the graph in `src/graph.js`:

```javascript
import { myNewNode } from './nodes/myNewNode.js';

graph.addNode("my_node", myNewNode);
graph.addEdge("previous_node", "my_node");
```

### Adding State Fields

Extend the state schema in `src/state/schema.js`:

```javascript
export const AnalyticsState = Annotation.Root({
  // ... existing fields
  myNewField: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  })
});
```

## Advanced Use Cases

### Multi-Agent Collaboration

Extend the workflow to include multiple specialized agents:

- **Data Explorer**: Finds relevant datasets
- **Analyst**: Interprets results
- **Visualizer**: Recommends charts
- **Reporter**: Synthesizes findings

### Human-in-the-Loop

Add approval checkpoints for data transformations:

```javascript
graph.addNode("approval", humanApprovalNode);
graph.addConditionalEdges("insights", (state) =>
  state.needsApproval ? "approval" : END
);
```

### Persistent State

Save workflow state to resume later:

```javascript
const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });

// Resume from checkpoint
await graph.invoke(input, { configurable: { thread_id: "123" } });
```

## Troubleshooting

### Connection Refused

If you see `ECONNREFUSED` errors:

1. Check that Cube API is running
2. Verify `CUBE_API_URL` and `AI_ENGINEER_URL` are correct
3. For local development, ensure services are on the right ports

### Module Not Found

If you see module import errors:

```bash
npm install
```

Make sure you're using Node.js 20+ with ES modules support.

### Authentication Errors

If authentication fails:

1. Verify `CUBE_API_KEY` is correct
2. Check that the agent ID exists
3. Ensure the tenant name matches your configuration

## Learn More

- [Cube AI Agents Documentation](https://docs.cube.dev/)
- [LangGraph.js Documentation](https://langchain-ai.github.io/langgraphjs/)
- [LangChain.js Documentation](https://js.langchain.com/)

## Related Examples

- [chat-api](../chat-api/) - Simple chat interface with Cube AI Agents
- [shared/cube-agent-client](../shared/cube-agent-client/) - Reusable Cube Agent client library

## License

MIT
