// langgraph-client.js
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// LangChain & LangGraph Imports
import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ToolExecutor } from "@langchain/langgraph/prebuilt";
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { tool } from "@langchain/core/tools"; // Import the tool function
import { z } from "zod"; // For tool schema definition

// Load environment variables
dotenv.config();

// --- Configuration ---
const MCP_AGENT_URL = process.env.MCP_AGENT_URL;
const MCP_AGENT_SECRET = process.env.MCP_AGENT_SECRET;
// const MCP_JWT_TOKEN = process.env.MCP_JWT_TOKEN; // Removed - Using secret directly
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

// --- LangGraph Agent State ---
// Add llmWithTools to the state definition
// interface AgentState { // Using comments since JS doesn't enforce interfaces
//  messages: BaseMessage[];
//  llmWithTools?: any; // Or specific type if known e.g. Runnable<...> 
// }

// --- LangGraph Nodes ---

// Define the function that calls the model
const callModel = async (state) => {
  console.log("--- [Node] Calling LLM --- ");
  const { messages, llmWithTools } = state; // Get llmWithTools from state
  if (!llmWithTools) {
    console.error("Error: llmWithTools not found in state.");
    // Handle error appropriately, maybe return an error message
    return { messages: [new AIMessage("Error: LLM configuration missing.")] };
  }
  const response = await llmWithTools.invoke(messages);
  console.log("--- [Node] LLM Response Received --- ");
  // We return a list, because this will get added to the existing list
  return { messages: [response] };
};

// Define the function to execute tools
const callToolNode = async (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const tools = state.tools; // Get tools from state

  if (!lastMessage || !(lastMessage instanceof AIMessage) || !lastMessage.tool_calls) {
    console.error("Error: Tool node called without pending tool calls.");
    return { messages: [] };
  }
  if (!tools || tools.length === 0) {
    console.error("Error: Tools not found in state.");
    // Return ToolMessage indicating error for the *first* tool call requested
    return { messages: [new ToolMessage({content: "Error: Tool configuration missing.", tool_call_id: lastMessage.tool_calls[0].id })] };
  }
  
  console.log("--- [Node] Executing Tools --- ");
  // Manual tool execution and ToolMessage creation
  const toolMessages = [];
  const mcpTool = tools[0]; // Assuming only one tool is passed

  for (const toolCall of lastMessage.tool_calls) {
    if (toolCall.name === mcpTool.name) {
        try {
          console.log(`Executing tool call: ${toolCall.id} for tool ${toolCall.name}`);
          const toolOutput = await mcpTool.invoke(toolCall.args);
          toolMessages.push(new ToolMessage({ content: toolOutput, tool_call_id: toolCall.id }));
        } catch (error) {
            console.error(`Error executing tool ${toolCall.name} for call ${toolCall.id}:`, error);
            // Still need to provide a ToolMessage, even if it's an error
            toolMessages.push(new ToolMessage({ content: `Error executing tool: ${error.message}`, tool_call_id: toolCall.id }));
        }
    } else {
        console.warn(`Tool call for unknown tool: ${toolCall.name}`);
        toolMessages.push(new ToolMessage({ content: `Error: Tool ${toolCall.name} not found.`, tool_call_id: toolCall.id }));
    }
  }

  console.log("--- [Node] Tool Execution Complete --- ");
  return { messages: toolMessages }; // Return the list of ToolMessages

  /* // Old code using ToolExecutor
  const action = new ToolExecutor({ tools }); // Use tools from state
  const response = await action.invoke(lastMessage);
  console.log("--- [Node] Tool Execution Complete --- ");
  return { messages: [response] }; // response should be ToolMessage
  */
};

// Define the function that determines whether to continue or not
const shouldContinue = (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  // If there are no tool calls, then we finish
  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return "end";
  }
  // Otherwise if there are tool calls, we call the tools
  return "continue";
};


// --- Main Execution --- 
async function runGraph(userInput, authToken) {
    // Initialize the LLM and Tool
    const llm = new ChatOpenAI({ apiKey: OPENAI_API_KEY, modelName: "gpt-4o" });

    // Define the MCP tool using the 'tool' function
    const mcpTool = tool(
      async (input) => { // The core logic from the previous _call method
        console.log(`--- [Tool] Calling invokeCubeAgent with query: "${input.user_query}" ---`);
        let client = null;
        let transport = null;
        const clientSessionId = `mcp-js-tool-${uuidv4()}`;

        try {
          transport = new StreamableHTTPClientTransport(
            new URL(MCP_AGENT_URL),
            {
              headers: { 'Authorization': `Bearer ${authToken}` }, // Use authToken from outer scope
              sessionId: clientSessionId
            }
          );
          transport.onerror = (e) => console.error('Transport Error:', e);

          client = new MCPClient({ name: 'mcp-js-tool-caller', version: '0.1.0' });
          client.onerror = (e) => console.error('Client Error:', e);

          await client.connect(transport);
          console.log(`[Tool] Connected. Server Session ID: ${transport.sessionId}`);

          const result = await client.callTool({ name: "invokeCubeAgent", arguments: { input: input.user_query } });
          console.log('[Tool] MCP call successful.');

          let responseText = "";
          if (result.is_error) {
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
        } finally {
            if (client && transport) {
                console.log('[Tool] Disconnecting...');
                await transport.close().catch(e => console.error("Error closing transport:", e));
            }
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

    const tools = [mcpTool];
    const llmWithTools = llm.bindTools(tools); // Define llmWithTools here

    // Define the graph
    // Use AgentState structure - note: JS doesn't enforce interfaces
    const workflow = new StateGraph({ channels: { 
      messages: { value: (x, y) => x.concat(y), default: () => [] }, 
      llmWithTools: null, 
      tools: null // Add tools channel
    } });

    // Define the nodes
    workflow.addNode("agent", callModel);
    workflow.addNode("action", callToolNode);

    // Build graph
    workflow.setEntryPoint("agent");
    workflow.addConditionalEdges(
      "agent",
      shouldContinue,
      {
        continue: "action",
        end: END,
      }
    );
    workflow.addEdge("action", "agent");

    // Compile graph
    const app = workflow.compile();

    console.log("\n--- Invoking LangGraph --- ");
    // Pass the initialized llmWithTools and tools in the initial input
    const inputs = { messages: [new HumanMessage(userInput)], llmWithTools: llmWithTools, tools: tools }; 
    const result = await app.invoke(inputs);

    console.log("\n--- LangGraph Result ---");
    console.log(result.messages[result.messages.length - 1].content);
}

async function initialize() {
    console.log('--- MCP JS Client with LangGraph ---');
    if (!MCP_AGENT_URL) {
        console.error('Error: MCP_AGENT_URL environment variable is not set.');
        process.exit(1);
    }
    if (!OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY environment variable is not set.');
        process.exit(1);
    }
    if (!MCP_AGENT_SECRET) { // Changed check
        console.error('Error: MCP_AGENT_SECRET must be set for authentication.'); // Updated error message
        process.exit(1);
    }

    // Directly generate token from secret
    console.log('Generating JWT from MCP_AGENT_SECRET...');
    console.log('MCP_AGENT_SECRET: ', MCP_AGENT_SECRET);
    console.log('OPENAI_API_KEY: ', OPENAI_API_KEY);
    console.log('MCP_AGENT_URL: ', MCP_AGENT_URL);
    const authToken = generateAuthToken(MCP_AGENT_SECRET);
    console.log('authToken: ', authToken);

    if (!authToken) {
        console.error('Error: Failed to generate authentication token from MCP_AGENT_SECRET.');
        process.exit(1);
    }

    const defaultInput = "Summarize user signups from the last 7 days.";
    const userInput = process.argv[2] || defaultInput;

    await runGraph(userInput, authToken);
}

initialize().catch(err => {
    console.error("Unhandled error during initialization or execution:", err);
    process.exit(1);
}); 