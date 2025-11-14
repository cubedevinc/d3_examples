import { config } from 'dotenv';
import { createAnalyticsGraph } from './graph.js';

// Load environment variables
config();

/**
 * Main entry point for the LangGraph analytics workflow
 */
async function main() {
  // Validate required environment variables
  if (!process.env.CUBE_TENANT_NAME || !process.env.CUBE_AGENT_ID || !process.env.CUBE_API_KEY) {
    console.error('❌ Error: Missing required environment variables');
    console.error('Please set: CUBE_TENANT_NAME, CUBE_AGENT_ID, CUBE_API_KEY');
    console.error('\nExample:');
    console.error('  CUBE_TENANT_NAME=your-tenant');
    console.error('  CUBE_AGENT_ID=1');
    console.error('  CUBE_API_KEY=your-api-key');
    process.exit(1);
  }

  // Cube agent configuration
  const cubeConfig = {
    tenantName: process.env.CUBE_TENANT_NAME,
    agentId: process.env.CUBE_AGENT_ID,
    apiKey: process.env.CUBE_API_KEY,
    cubeApiUrl: process.env.CUBE_API_URL,
    aiEngineerUrl: process.env.AI_ENGINEER_URL
  };

  // Get the user's question from command line or use default
  const userQuestion = process.argv[2] || 'What is the total revenue?';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   LangGraph Analytics Workflow                           ║');
  console.log('║   Powered by Cube AI Agents                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`📝 Question: "${userQuestion}"`);
  console.log(`🏢 Tenant: ${cubeConfig.tenantName}`);
  console.log(`🤖 Agent: ${cubeConfig.agentId}`);
  console.log();

  try {
    // Create the workflow graph
    const graph = createAnalyticsGraph(cubeConfig);

    console.log('🚀 Starting workflow execution...\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Execute the workflow
    const result = await graph.invoke({
      userQuestion,
      messages: [],
      retryCount: 0
    });

    // Display results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('\n✅ Workflow completed successfully!\n');

    if (result.error) {
      console.log('❌ Error:', result.error);
    } else {
      console.log('📊 Results:');
      console.log('─────────────────────────────────────────────────────────');

      // Show the Cube agent's response (main content)
      if (result.cubeResults && result.cubeResults.content) {
        console.log('\n💬 Agent Response:');
        console.log(result.cubeResults.content);
      }

      // Show insights from workflow processing (if any)
      if (result.insights && result.insights.length > 0) {
        console.log('\n💡 Workflow Insights:');
        result.insights.forEach((insight, i) => {
          console.log(`   ${i + 1}. ${insight}`);
        });
      }

      console.log('\n─────────────────────────────────────────────────────────');
      console.log(`\n📝 Question Type: ${result.questionType}`);
      console.log(`🔄 Retry Count: ${result.retryCount}`);
      console.log(`💬 Workflow Messages: ${result.messages.length}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Connection refused. Please ensure:');
      console.error(`   - Cube API is running at: ${cubeConfig.cubeApiUrl || 'default URL'}`);
      console.error(`   - AI Engineer is running at: ${cubeConfig.aiEngineerUrl || 'default URL'}`);
    }
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main();
