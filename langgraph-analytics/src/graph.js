import { StateGraph, START, END } from "@langchain/langgraph";
import { AnalyticsState } from "./state/schema.js";
import { classifyQuestion } from "./nodes/classifyQuestion.js";
import { createCubeQueryNode } from "./nodes/cubeQuery.js";
import { analyzeResults } from "./nodes/analyzeResults.js";
import { generateInsights } from "./nodes/generateInsights.js";

/**
 * Create the analytics workflow graph
 * @param {Object} cubeConfig - Configuration for Cube Agent Client
 * @returns {CompiledGraph} The compiled LangGraph workflow
 */
export function createAnalyticsGraph(cubeConfig) {
  console.log('\n📈 Building analytics workflow graph...\n');

  // Create the state graph
  const graph = new StateGraph(AnalyticsState);

  // Add nodes to the graph
  graph.addNode("classify", classifyQuestion);
  graph.addNode("cube_query", createCubeQueryNode(cubeConfig));
  graph.addNode("analyze", analyzeResults);
  graph.addNode("generate_insights", generateInsights);

  // Define the workflow edges
  // START → classify question
  graph.addEdge(START, "classify");

  // classify → cube query
  graph.addEdge("classify", "cube_query");

  // cube_query → analyze (with retry logic)
  // If retryCount > 0, loop back to cube_query, otherwise proceed to analyze
  graph.addConditionalEdges(
    "cube_query",
    (state) => {
      if (state.error && state.retryCount > 0 && state.retryCount <= 3) {
        return "cube_query"; // Retry
      }
      if (state.error && state.retryCount > 3) {
        return END; // Failed after max retries
      }
      return "analyze"; // Success, proceed
    }
  );

  // analyze → generate_insights
  graph.addEdge("analyze", "generate_insights");

  // generate_insights → END
  graph.addEdge("generate_insights", END);

  console.log('✓ Graph structure:');
  console.log('  START → classify → cube_query → analyze → generate_insights → END');
  console.log('                       ↓ (retry)');
  console.log('                     cube_query\n');

  // Compile and return the graph
  return graph.compile();
}
