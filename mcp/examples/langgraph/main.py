import asyncio
import os
import json
import uuid
from typing import Annotated, Sequence, TypedDict, List, Dict, Any, Optional
from operator import itemgetter

# --- LangChain Imports ---
from langchain_core.messages import BaseMessage, ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
# ToolNode is removed as we manually call the tool via session
# from langgraph.prebuilt import ToolNode 

# --- Local MCP SDK Imports ---
try:
    from mcp.client import ClientSession
    from mcp.client.sse import sse_client
    import mcp.types as mcp_types
except ImportError as e:
    print(f"Error importing from local MCP SDK: {e}")
    print("Ensure ../python-sdk is linked/installed correctly.")
    exit(1)

# --- Common Config Import ---
try:
    from mcp.common.config import load_mcp_config, get_mcp_headers
except ImportError:
    print("Error: Could not import from mcp.common.config.")
    exit(1)

# --- Configuration ---
MCP_AGENT_URL, MCP_AGENT_SECRET = load_mcp_config()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# --- LangGraph State ---
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], itemgetter("messages")]
    # Store the active MCP session and fetched tool schemas
    mcp_session: Optional[ClientSession]
    mcp_tool_schemas: Dict[str, Any]

# --- Custom Tool Schema Generation ---
def create_dynamic_tools_for_llm(schemas: Dict[str, Any]) -> List[type[BaseModel]]:
    """Dynamically creates Pydantic models from MCP tool schemas for LLM binding."""
    dynamic_tools = []
    for name, schema in schemas.items():
        fields = {}
        required_args = [arg["name"] for arg in schema.get("arguments", []) if arg.get("required", False)]
        for arg in schema.get("arguments", []):
            arg_name = arg["name"]
            # Basic type mapping (can be expanded)
            arg_type = str # Default to string
            # TODO: Add more robust type mapping (e.g., integer, number, boolean)
            # field_type = (arg_type, ...) if arg_name in required_args else (Optional[arg_type], None)
            field_type = (arg_type, ...)
            fields[arg_name] = Field(..., description=arg.get("description", ""))

        # Create a Pydantic model dynamically
        ToolModel = type(
            name, # Class name is the tool name
            (BaseModel,),
            {
                "__annotations__": {arg_name: arg_type for arg_name, (arg_type, _) in fields.items()},
                **{arg_name: field_desc for arg_name, field_desc in fields.items()},
                 "__doc__": schema.get("description", f"Invoke the {name} tool.")
            }
        )
        dynamic_tools.append(ToolModel)
    return dynamic_tools

# --- LangGraph Nodes ---
def should_continue(state: AgentState) -> str:
    """Decides whether to execute tools or finish."""
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "execute_tools"
    return END

async def call_model(state: AgentState):
    """Calls the LLM with dynamically bound tools based on fetched schemas."""
    print("--- [Agent Node] Calling LLM --- ")
    llm = ChatOpenAI(model=OPENAI_MODEL, temperature=0)
    tool_schemas = state.get("mcp_tool_schemas", {})
    if not tool_schemas:
        print("Warning: No MCP tool schemas found in state for LLM binding.")
        llm_with_tools = llm # Call LLM without tools if none were found
    else:
        # Dynamically create Pydantic models for the LLM
        dynamic_llm_tools = create_dynamic_tools_for_llm(tool_schemas)
        print(f"Binding {len(dynamic_llm_tools)} tools to LLM: {[t.__name__ for t in dynamic_llm_tools]}")
        llm_with_tools = llm.bind_tools(dynamic_llm_tools)

    response = await llm_with_tools.ainvoke(state["messages"])
    print(f"--- [Agent Node] LLM Response: {response.content[:100]}... Tool Calls: {response.tool_calls}")
    return {"messages": [response]}

async def call_mcp_tools(state: AgentState) -> Dict[str, List]:
    """Executes the tools called by the LLM using the active MCP session."""
    print("--- [Tool Node] Executing MCP Tools --- ")
    last_message = state["messages"][-1]
    session = state.get("mcp_session")
    tool_messages: List[BaseMessage] = []

    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        print("No tool calls requested by LLM.")
        return {"messages": tool_messages}

    if not session:
        print("Error: MCP session not found in state for tool execution.")
        for tool_call in last_message.tool_calls:
            tool_messages.append(
                ToolMessage(content="Error: MCP session not available.", tool_call_id=tool_call["id"])
            )
        return {"messages": tool_messages}

    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        print(f"Executing tool: {tool_name} with args: {tool_args}")
        try:
            # Arguments are expected to be a dict by the SDK
            if not isinstance(tool_args, dict):
                 print(f"Warning: Tool arguments are not a dict: {type(tool_args)}. Attempting to use anyway.")
            
            result: mcp_types.CallToolResult = await session.call_tool(tool_name, arguments=tool_args)
            print(f"Tool {tool_name} execution finished.")

            # Process result - extract text or stringify
            if result.is_error:
                content_str = f"Error executing tool {tool_name}."
                if result.content and isinstance(result.content, list) and len(result.content) > 0:
                    try: content_str = json.dumps(result.content[0]) # Attempt to serialize first part
                    except Exception: pass 
                print(f"Tool Error: {content_str}")
            else:
                content_str = "Tool finished successfully."
                if result.content and isinstance(result.content, list) and len(result.content) > 0:
                    first_part = result.content[0]
                    if isinstance(first_part, mcp_types.TextContent):
                        content_str = first_part.text
                    else:
                        try: content_str = json.dumps(first_part)
                        except Exception: content_str = "Received non-serializable content."
                print(f"Tool Result: {content_str[:100]}...")
            
            tool_messages.append(ToolMessage(content=content_str, tool_call_id=tool_call["id"]))

        except Exception as e:
            error_msg = f"Failed to execute MCP tool '{tool_name}': {type(e).__name__}: {e}"
            print(error_msg)
            tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_call["id"]))

    return {"messages": tool_messages}


# --- Build LangGraph ---
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.add_node("execute_tools", call_mcp_tools) # Renamed node
workflow.set_entry_point("agent")
workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "execute_tools": "execute_tools", # Connect agent to tool execution
        END: END,
    },
)
workflow.add_edge("execute_tools", "agent") # Loop back to agent after execution
graph = workflow.compile()

# --- Main Execution Logic ---
async def run_agent_loop():
    """Connects to MCP server, fetches tools, and runs the chat loop."""
    if not OPENAI_API_KEY:
        print("Error: OPENAI_API_KEY environment variable not set.")
        return
    if not MCP_AGENT_URL:
        print("Error: MCP_AGENT_URL environment variable not set.")
        return
    if not MCP_AGENT_SECRET:
        print("Error: MCP_AGENT_SECRET environment variable not set (required for authentication).")
        return

    print("\n--- Starting LangGraph Agent with Dynamic MCP Tools --- ")
    session_id = f"langgraph-client-session-{uuid.uuid4()}"
    headers = get_mcp_headers(MCP_AGENT_SECRET, session_id)
    if "Authorization" not in headers and MCP_AGENT_SECRET:
         print("Error: Failed to generate JWT token for authentication.")
         return

    print(f"Headers: {headers}")
    print(f"Attempting to connect to: {MCP_AGENT_URL} with session: {session_id}")

    try:
        async with sse_client(url=MCP_AGENT_URL, headers=headers) as (read, write):
            print("MCP SSE transport connected.")
            async with ClientSession(read, write) as session:
                print("Initializing MCP session...")
                await session.initialize()
                print("MCP Session Initialized.")

                # Fetch tools from the server
                print("Fetching available tools from MCP server...")
                try:
                    tools_list = await session.list_tools()
                    # Convert tool list to schema dict for the graph state
                    tool_schemas = {
                        tool.name: {
                            "name": tool.name,
                            "description": tool.description,
                            "arguments": [
                                {"name": arg.name, "description": arg.description, "type": arg.type, "required": arg.required}
                                for arg in tool.arguments
                            ]
                        }
                        for tool in tools_list
                    }
                    print(f"Found {len(tool_schemas)} tools: {list(tool_schemas.keys())}")
                except Exception as e:
                     print(f"Error fetching tools from MCP server: {e}")
                     tool_schemas = {} # Continue without tools if fetch fails

                # Start interactive loop
                print("Type 'quit' or 'exit' to end.")
                messages: List[BaseMessage] = [
                    SystemMessage(content="You are a helpful assistant. Use the available tools when necessary.")
                ]

                while True:
                    try:
                        user_input = input("\nYou: ").strip()
                        if user_input.lower() in ["quit", "exit"]:
                            break
                        if not user_input:
                            continue

                        messages.append(HumanMessage(content=user_input))

                        # Prepare initial state for this invocation
                        graph_input = {
                            "messages": messages,
                            "mcp_session": session, # Pass the active session
                            "mcp_tool_schemas": tool_schemas # Pass fetched schemas
                        }
                        print("--- Invoking LangGraph --- ")

                        final_state = await graph.ainvoke(graph_input)

                        if final_state:
                            final_response_message = final_state["messages"][-1]
                            if final_response_message not in messages:
                                messages.append(final_response_message)
                            print(f"\nAssistant: {final_response_message.content}")
                        else:
                             print("\nAssistant: Graph execution error.")
                             messages.append(AIMessage(content="Sorry, I encountered an issue."))

                    except KeyboardInterrupt:
                        print("\nExiting loop...")
                        break
                    except Exception as e:
                        print(f"\nAn error occurred in the chat loop: {e}")
                        # import traceback; traceback.print_exc()

    except ConnectionRefusedError:
        print(f"Fatal Error: Connection refused to {MCP_AGENT_URL}. Is the server running?")
    except Exception as e:
        print(f"Fatal Error during MCP connection/initialization: {type(e).__name__}: {e}")

    print("\n--- Agent Finished ---")


def main():
    """Synchronous entry point for the agent loop."""
    # Use asyncio.run for the main async function
    asyncio.run(run_agent_loop())


if __name__ == "__main__":
    main() 