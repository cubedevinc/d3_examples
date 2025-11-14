import { CubeAgentClient } from '../shared/cube-agent-client/index.js';

// Configuration from environment variables
const TENANT_NAME = process.env.CUBE_TENANT_NAME;
const AGENT_ID = process.env.CUBE_AGENT_ID;
const API_KEY = process.env.CUBE_API_KEY;
const CUBE_API_URL = process.env.CUBE_API_URL;
const AI_ENGINEER_URL = process.env.AI_ENGINEER_URL;

// Validate required environment variables
if (!TENANT_NAME || !AGENT_ID || !API_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Please set: CUBE_TENANT_NAME, CUBE_AGENT_ID, CUBE_API_KEY');
  process.exit(1);
}

// Main execution
async function main() {
  try {
    // Create Cube Agent client
    const client = new CubeAgentClient({
      tenantName: TENANT_NAME,
      agentId: AGENT_ID,
      apiKey: API_KEY,
      cubeApiUrl: CUBE_API_URL,
      aiEngineerUrl: AI_ENGINEER_URL
    });

    // Get message from command line or use default
    const message = process.argv[2] || 'What is the total revenue?';

    console.log('Generating session...');

    // Stream chat with real-time callbacks
    const events = await client.streamChat(message, {
      onChunk: (content) => {
        // Display content as it streams
        process.stdout.write(content);
      },
      onThinking: (thought) => {
        // Display thinking process
        if (process.env.DEBUG) {
          console.log(`\n[Thinking] ${thought}`);
        }
      },
      onToolCall: (tool) => {
        // Display tool calls
        if (process.env.DEBUG) {
          console.log(`\n[Tool Call] ${tool.name}`);
          if (tool.input) {
            console.log(`  Input: ${JSON.stringify(tool.input)}`);
          }
          if (tool.output) {
            console.log(`  Output: ${JSON.stringify(tool.output)}`);
          }
        }
      }
    });

    // Display full debug information if requested
    if (process.env.DEBUG) {
      console.log('\n\n[DEBUG] Full event stream:');
      events.forEach(event => {
        console.log(JSON.stringify(event, null, 2));
      });
    }

    console.log('\n\nStream completed');

  } catch (error) {
    console.error('\nError:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nConnection refused. Please ensure:');
      console.error(`  - Cube API is running`);
      console.error(`  - AI Engineer API is running`);
    }
    process.exit(1);
  }
}

main();
