import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LoggingMessageNotificationSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import readline from 'readline'; // Import readline

// LangChain & LangGraph Imports
import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Load environment variables
dotenv.config();

// --- Configuration ---
const D3_MCP_AGENT_URL = process.env.D3_MCP_AGENT_URL;
const D3_MCP_AGENT_SECRET = process.env.D3_MCP_AGENT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- Auth Helper ---
function generateAuthToken(secret, userContext = 'mcp-js-langgraph') {
  if (!secret) return null;
  const payload = { context: { user: userContext }, exp: Math.floor(Date.now() / 1000) + 3600 };
  try {
    return jwt.sign(payload, secret, { algorithm: 'HS256' });
  } catch (err) {
    console.error("Error generating JWT:", err);
    return null;
  }
}

// --- LangGraph Nodes ---

// Node: Calls the LLM
const callModel = async (state) => {
  console.log("--- [Node] Calling LLM ---");
  const { messages, llmWithTools } = state; // Get llmWithTools from state
  if (!llmWithTools) {
    console.error("Error: llmWithTools not found in state.");
    return { messages: [new AIMessage("Error: LLM configuration missing.")] };
  }
  const response = await llmWithTools.invoke(messages);
  console.log("--- [Node] LLM Response Received ---");
  return { messages: [response] }; // Append response to messages
};

// Node: Executes Tools
const callToolNode = async (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const tools = state.tools; // Get tools from state

  // Basic validation
  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls) {
    console.error("Error: Tool node called without pending tool calls in the last message.");
    return { messages: [] }; // Return empty if no tool calls expected
  }
  if (!tools || tools.length === 0) {
    console.error("Error: No tools configured in state.");
    // Provide error ToolMessage for the *first* requested tool call
    return { messages: [new ToolMessage({ content: "Error: Tool configuration missing.", tool_call_id: lastMessage.tool_calls[0].id })] };
  }

  console.log("--- [Node] Executing Tools ---");
  const toolMessages = [];
  // Assuming only the first tool in the state is the MCP tool we want to use
  // If multiple tools were possible, logic here would need refinement
  const mcpTool = tools[0];

  for (const toolCall of lastMessage.tool_calls) {
    if (toolCall.name === mcpTool.name) {
      try {
        console.log(`Executing tool call: ${toolCall.id} for tool ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`);
        const toolOutput = await mcpTool.invoke(toolCall.args);
        toolMessages.push(new ToolMessage({ content: toolOutput, tool_call_id: toolCall.id }));
      } catch (error) {
        console.error(`Error executing tool ${toolCall.name} (ID: ${toolCall.id}):`, error);
        toolMessages.push(new ToolMessage({ content: `Error executing tool: ${error.message}`, tool_call_id: toolCall.id }));
      }
    } else {
      console.warn(`Tool call for unknown/unconfigured tool: ${toolCall.name} (ID: ${toolCall.id})`);
      toolMessages.push(new ToolMessage({ content: `Error: Tool ${toolCall.name} not found or configured.`, tool_call_id: toolCall.id }));
    }
  }

  console.log("--- [Node] Tool Execution Complete ---");
  return { messages: toolMessages };
};

// Node: Determines whether to continue or end the graph
const shouldContinue = (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  // End if the last message is not an AIMessage or has no tool calls
  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return "end";
  }
  // Continue if there are tool calls
  return "continue";
};

// --- Main Execution ---
async function runGraph(userInput, authToken) {
  // Initialize LLM
  const llm = new ChatOpenAI({ apiKey: OPENAI_API_KEY, modelName: "gpt-4o" });

  // Setup MCP Transport
  const transport = new StreamableHTTPClientTransport(
    new URL(D3_MCP_AGENT_URL),
    {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      },
    }
  );
  transport.onerror = (e) => console.error('Transport Error:', e);

  // Setup MCP Client
  const client = new MCPClient({
    name: 'mcp-js-tool-caller',
    version: '0.1.0',
  });
  client.onerror = (e) => console.error('Client Error:', e);

  // Add Notification Handler
  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    // TODO: Handle notifications
    console.log(`Level: ${notification?.params?.level || 'INFO'}, Data: ${notification?.params?.data || 'No data'}`);
  });

  // Connect Client
  await client.connect(transport);
  console.log(`[MCP Client] Connected. Server Session ID: ${transport.sessionId}`);

  // Define the MCP tool wrapper for LangGraph
  const mcpTool = tool(
    async (input) => {
      console.log(`--- [Tool] Calling invokeCubeAgent with query: "${input.user_query}" ---`);
      try {
        console.log(`[Tool] Calling client.callTool with name: "invokeCubeAgent" and args: ${JSON.stringify(input)}`);
        const result = await client.callTool(
          {
            name: "invokeCubeAgent",
            arguments: { input: input.user_query },
          },
          CallToolResultSchema,
          {
            resetTimeoutOnProgress: true,
            onprogress: (progress) => {
              // TODO: Handle progress updates
            }
          }
        );
        console.log('[Tool] MCP call successful.');

        // Process result
        let responseText = "";
        if (result.isError) {
          responseText = `Error from remote agent: ${JSON.stringify(result.content)}`;
          console.error(responseText);
        } else {
          const textParts = result.content.filter(item => item.type === 'text');
          if (textParts.length > 0) {
            responseText = textParts.map(item => item.text).join('\n');
          } else {
            responseText = "Remote agent finished but provided no text output.";
          }
        }
        return responseText;

      } catch (error) {
        console.error(`[Tool] Error during MCP operation: ${error.message || error}`);
        return `Error interacting with remote agent: ${error.message || error}`;
      }
    },
    {
      // Schema definition for the tool function
      name: "invokeCubeAgent",
      description: "Invokes the remote Cube D3 AI Agent via MCP to answer questions or perform actions based on enterprise data.",
      schema: z.object({
        user_query: z.string().describe("The natural language query from the user for the Cube Agent.")
      })
    }
  );

  // Prepare tools and LLM for LangGraph
  const tools = [mcpTool];
  const llmWithTools = llm.bindTools(tools);

  // Define the LangGraph workflow state
  const workflow = new StateGraph({
    channels: {
      messages: { value: (x, y) => x.concat(y), default: () => [] },
      llmWithTools: null,
      tools: null
    }
  });

  // Define the nodes
  workflow.addNode("agent", callModel);
  workflow.addNode("action", callToolNode);

  // Build the graph topology
  workflow.setEntryPoint("agent");
  workflow.addConditionalEdges(
    "agent",
    shouldContinue,
    {
      continue: "action", // If tool call needed, go to action node
      end: END,          // Otherwise, end the graph
    }
  );
  workflow.addEdge("action", "agent"); // After action, go back to agent node

  // Compile the graph into a runnable app
  const app = workflow.compile();

  console.log("\n--- Invoking LangGraph ---");
  // Initial input for the graph, including the configured LLM and tools
  const inputs = {
    messages: [new HumanMessage(userInput)],
    llmWithTools: llmWithTools,
    tools: tools
  };
  const result = await app.invoke(inputs);

  console.log("\n--- LangGraph Final Result ---");
  console.log(result.messages[result.messages.length - 1].content);
}

// --- Initialization and Script Execution ---
async function initialize() {
  console.log('--- MCP JS Client with LangGraph ---');

  // Validate required environment variables
  if (!D3_MCP_AGENT_URL) {
    console.error('Error: D3_MCP_AGENT_URL environment variable is not set.');
    process.exit(1);
  }
  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is not set.');
    process.exit(1);
  }
  if (!D3_MCP_AGENT_SECRET) {
    console.error('Error: D3_MCP_AGENT_SECRET must be set for authentication.');
    process.exit(1);
  }

  // Generate authentication token
  console.log('Generating JWT from D3_MCP_AGENT_SECRET...');
  const authToken = generateAuthToken(D3_MCP_AGENT_SECRET);
  if (!authToken) {
    console.error('Error: Failed to generate authentication token from D3_MCP_AGENT_SECRET.');
    process.exit(1);
  }
  console.log('Authentication token generated successfully.'); // Added confirmation

  // Get user input (either from argv or prompt)
  let userInput = process.argv[2];
  if (!userInput) {
    console.log("No input provided via command line argument.");
    userInput = await askQuestion("Please enter your query: ");
    if (!userInput) {
      console.error("No input provided. Exiting.");
      process.exit(1);
    }
  }

  console.log(`Using input: "${userInput}"`);

  // Run the main graph logic
  await runGraph(userInput, authToken);
}

// Entry point: Call initialize and catch any top-level errors
initialize().catch(err => {
  console.error("\n--- Unhandled Error ---");
  console.error("An unexpected error occurred during initialization or execution:", err);
  process.exit(1);
});

// Helper function to ask user a question via terminal
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }))
} 