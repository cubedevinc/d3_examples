import { CubeAgentClient } from '../../../shared/cube-agent-client/index.js';

/**
 * Create a Cube query node that queries the Cube agent
 * Returns a function that can be used as a LangGraph node
 */
export function createCubeQueryNode(cubeConfig) {
  const client = new CubeAgentClient(cubeConfig);

  return async function cubeQuery(state) {
    const { userQuestion, retryCount = 0 } = state;

    console.log('📊 Querying Cube agent...');

    try {
      // Get detailed response including thinking and tool calls
      const response = await client.chatDetailed(userQuestion);

      console.log('   ✓ Query successful');
      if (response.thinking.length > 0) {
        console.log(`   💭 Thinking: ${response.thinking[0]}`);
      }
      if (response.toolCalls.length > 0) {
        console.log(`   🔧 Used ${response.toolCalls.length} tool(s)`);
      }

      return {
        cubeResults: response,
        retryCount: 0,
        error: null,
        messages: [
          { role: 'assistant', content: response.content },
          { role: 'system', content: `Query completed successfully. Tool calls: ${response.toolCalls.length}` }
        ]
      };
    } catch (error) {
      console.error(`   ✗ Query failed: ${error.message}`);

      // Retry logic
      if (retryCount < 3) {
        console.log(`   🔄 Retrying... (attempt ${retryCount + 1}/3)`);
        return {
          retryCount: retryCount + 1,
          error: error.message,
          messages: [{ role: 'system', content: `Query failed, retrying... (${retryCount + 1}/3)` }]
        };
      }

      // Max retries reached
      return {
        error: `Failed after 3 attempts: ${error.message}`,
        messages: [{ role: 'system', content: `Query failed permanently: ${error.message}` }]
      };
    }
  };
}
