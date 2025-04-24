import asyncio
import os
import json
import uuid
import traceback
import httpx
import logging
from typing import Annotated, Sequence, TypedDict, List, Dict, Any, Optional
from operator import itemgetter

# --- LangChain Imports ---
from langchain_core.messages import BaseMessage, ToolMessage, AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field # Use Pydantic v2 directly
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
# ToolNode is removed as we manually call the tool via session
# from langgraph.prebuilt import ToolNode

# --- Local MCP SDK Imports ---
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
import mcp.types as mcp_types
# Need access to request/result types for manual init
from mcp.types import (
    ClientRequest, InitializeRequest, InitializeRequestParams, ClientCapabilities,
    InitializeResult, SamplingCapability, RootsCapability, LATEST_PROTOCOL_VERSION,
    Implementation,
    # JSONRPCMessage # Not directly needed for parsing top-level response
)

# --- Common Config Import ---
try:
    from d3_mcp_client.common.config import load_mcp_config, get_mcp_headers
except ImportError:
    print("Error: Could not import from d3_mcp_client.common.config.")
    exit(1)

# --- Configuration ---
MCP_AGENT_URL, MCP_AGENT_SECRET = load_mcp_config()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
logger = logging.getLogger(__name__) # Use a logger

# --- LangGraph State ---
class AgentState(TypedDict):
    messages: Sequence[BaseMessage]
    mcp_session: Optional[ClientSession]
    mcp_tool_schemas: Dict[str, Any]

# --- Custom Tool Schema Generation ---
def create_dynamic_tools_for_llm(schemas: Dict[str, Any]) -> List[type[BaseModel]]:
    """Dynamically creates Pydantic models from MCP tool schemas for LLM binding."""
    dynamic_tools = []
    for name, schema in schemas.items():
        fields = {}
        # required_args = [arg["name"] for arg in schema.get("arguments", []) if arg.get("required", False)] # Pydantic v2 handles required implicitly
        for arg in schema.get("arguments", []):
            arg_name = arg["name"]
            arg_type = str # Default to string, TODO: Expand type mapping
            # Use Field for description
            fields[arg_name] = (arg_type, Field(..., description=arg.get("description", "")))

        # Create Pydantic model dynamically
        ToolModel = type(
            name,
            (BaseModel,),
            {
                "__annotations__": {arg_name: type_hint for arg_name, (type_hint, _) in fields.items()},
                **{arg_name: field_def for arg_name, (_, field_def) in fields.items()},
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
    logger.debug("--- [Agent Node] Calling LLM --- ")
    llm = ChatOpenAI(model=OPENAI_MODEL, temperature=0)
    tool_schemas = state.get("mcp_tool_schemas", {})
    if not tool_schemas:
        logger.warning("No MCP tool schemas found in state for LLM binding.")
        llm_with_tools = llm
    else:
        dynamic_llm_tools = create_dynamic_tools_for_llm(tool_schemas)
        logger.debug(f"Binding {len(dynamic_llm_tools)} tools to LLM: {[t.__name__ for t in dynamic_llm_tools]}")
        llm_with_tools = llm.bind_tools(dynamic_llm_tools)

    response = await llm_with_tools.ainvoke(state["messages"])
    logger.debug(f"--- [Agent Node] LLM Response: {response.content[:100]}... Tool Calls: {response.tool_calls}")
    return {"messages": [response]}

async def call_mcp_tools(state: AgentState) -> Dict[str, List]:
    """Executes the tools called by the LLM using the active MCP session."""
    logger.debug("--- [Tool Node] Executing MCP Tools --- ")
    last_message = state["messages"][-1]
    session = state.get("mcp_session")
    tool_messages: List[BaseMessage] = []

    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        logger.debug("No tool calls requested by LLM.")
        return {"messages": tool_messages}

    if not session:
        logger.error("MCP session not found in state for tool execution.")
        for tool_call in last_message.tool_calls:
            tool_messages.append(
                ToolMessage(content="Error: MCP session not available.", tool_call_id=tool_call["id"])
            )
        return {"messages": tool_messages}

    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        logger.debug(f"Executing tool: {tool_name} with args: {tool_args}")
        try:
            if not isinstance(tool_args, dict):
                 logger.warning(f"Tool arguments are not a dict: {type(tool_args)}. Attempting to use anyway.")

            result: mcp_types.CallToolResult = await session.call_tool(tool_name, arguments=tool_args)
            logger.debug(f"Tool {tool_name} execution finished.")

            # Process result
            if result.is_error:
                content_str = f"Error executing tool {tool_name}."
                if result.content and isinstance(result.content, list) and len(result.content) > 0:
                    try: content_str = json.dumps(result.content[0])
                    except Exception: pass
                logger.error(f"Tool Error: {content_str}")
            else:
                content_str = "Tool finished successfully."
                if result.content and isinstance(result.content, list) and len(result.content) > 0:
                    first_part = result.content[0]
                    if isinstance(first_part, mcp_types.TextContent):
                        content_str = first_part.text
                    else:
                        try: content_str = json.dumps(first_part)
                        except Exception: content_str = "Received non-serializable content."
                logger.debug(f"Tool Result: {content_str[:100]}...")

            tool_messages.append(ToolMessage(content=content_str, tool_call_id=tool_call["id"]))

        except Exception as e:
            error_msg = f"Failed to execute MCP tool '{tool_name}': {type(e).__name__}: {e}"
            logger.error(error_msg)
            tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_call["id"]))

    return {"messages": tool_messages}


# --- Build LangGraph ---
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.add_node("execute_tools", call_mcp_tools)
workflow.set_entry_point("agent")
workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "execute_tools": "execute_tools",
        END: END,
    },
)
workflow.add_edge("execute_tools", "agent")
graph = workflow.compile()

# --- Main Execution Logic (Refactored for POST Initialize First) ---
async def run_agent_loop():
    """Connects to MCP server, fetches tools, and runs the chat loop."""

    # --- Logging Setup ---
    logging.basicConfig(
        level=logging.INFO, # Start with INFO, set DEBUG if needed
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    # logging.getLogger("mcp").setLevel(logging.DEBUG) # Uncomment to debug SDK internals
    # logging.getLogger("httpx").setLevel(logging.DEBUG) # Uncomment to debug HTTP requests
    # --- End Logging Setup ---

    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY environment variable not set.")
        return
    if not MCP_AGENT_URL:
        logger.error("MCP_AGENT_URL environment variable not set.")
        return
    if not MCP_AGENT_SECRET:
        logger.error("MCP_AGENT_SECRET environment variable not set (required for authentication).")
        return

    print("--- Starting LangGraph Agent (POST Initialize First) --- ")

    server_session_id: Optional[str] = None
    tool_schemas: Dict[str, Any] = {}
    active_session: Optional[ClientSession] = None # To hold the session instance

    # 1. Manual Initialize Step
    init_headers = get_mcp_headers(MCP_AGENT_SECRET, session_id=None) # No session ID yet
    logger.info(f"Attempting manual initialize POST to: {MCP_AGENT_URL}")
    logger.debug(f"Initial POST Headers: {init_headers}")

    init_params = InitializeRequestParams(
        protocolVersion=LATEST_PROTOCOL_VERSION,
        capabilities=ClientCapabilities(
            sampling=SamplingCapability(), # Indicate sampling support if needed by server
            roots=RootsCapability(listChanged=True) # Indicate roots support if needed
        ),
        clientInfo=Implementation(
            name="LangGraph Agent",
            version="0.1.0",
        )
    )
    init_request_id = f"init-{uuid.uuid4()}"

    # Construct the raw JSON-RPC payload dictionary manually
    init_payload_dict = {
        "jsonrpc": "2.0",
        "method": "initialize",
        # Use model_dump to serialize params correctly
        "params": init_params.model_dump(mode="json", by_alias=True, exclude_none=True),
        "id": init_request_id,
    }

    # Use httpx client for the manual POST
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                MCP_AGENT_URL,
                headers=init_headers,
                json=init_payload_dict # Send the raw dictionary
            )
            logger.debug(f"Initialize POST Response Status: {response.status_code}")
            logger.debug(f"Initialize POST Raw Response Text: {response.text}") # Log raw text
            response.raise_for_status()

            # Manually parse SSE formatted response
            raw_text = response.text
            if raw_text.startswith("event: message\ndata:"):
                json_str = raw_text.split("data:", 1)[1].strip()
                try:
                    init_response_data = json.loads(json_str)
                    logger.debug(f"Parsed Initialize JSON Data: {init_response_data}")
                except json.JSONDecodeError as json_err:
                    raise ValueError(f"Failed to decode JSON from SSE data: {json_err}. Data: {json_str}") from json_err
            elif raw_text.startswith("data:"): # Handle case with only data: line
                json_str = raw_text.split("data:", 1)[1].strip()
                try:
                    init_response_data = json.loads(json_str)
                    logger.debug(f"Parsed Initialize JSON Data (data only): {init_response_data}")
                except json.JSONDecodeError as json_err:
                    raise ValueError(f"Failed to decode JSON from SSE data: {json_err}. Data: {json_str}") from json_err
            else:
                # Attempt direct JSON parsing if not SSE format (fallback)
                try:
                    init_response_data = response.json()
                    logger.warning("Initialize response was not SSE format, parsed as direct JSON.")
                except json.JSONDecodeError as json_err:
                     raise ValueError(f"Initialize response was not valid JSON or expected SSE format. Text: {raw_text}") from json_err

            if init_response_data.get("id") != init_request_id:
                logger.warning(f"Initialize response ID mismatch! Expected {init_request_id}, got {init_response_data.get('id')}")

            if "error" in init_response_data:
                error_obj = init_response_data["error"]
                raise RuntimeError(f"Initialize failed: {error_obj.get('code')} - {error_obj.get('message')}")

            if "result" not in init_response_data:
                 raise ValueError(f"Invalid initialize response structure (missing 'result'): {init_response_data}")

            init_result = InitializeResult.model_validate(init_response_data["result"])

            server_session_id = getattr(init_result, 'sessionId', None)
            if not server_session_id:
                raise ValueError("Server did not return a session ID in initialize response.")

            logger.info(f"Manual Initialize successful. Session ID: {server_session_id}")

            if init_result.capabilities and init_result.capabilities.tools:
                tools_list = init_result.capabilities.tools.tools or []
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
                logger.info(f"Found {len(tool_schemas)} tools from init response: {list(tool_schemas.keys())}")
            else:
                 logger.warning("No tools found in server capabilities during initialization.")

    except httpx.HTTPStatusError as e:
        error_body = "<Could not read error body>"
        try: error_body = e.response.text
        except Exception: pass
        logger.error(f"Fatal Error: HTTP {e.response.status_code} during manual MCP initialize POST.")
        logger.error(f"Response body: {error_body}")
        return
    except Exception as e:
        logger.error(f"Fatal Error during manual MCP initialize: {type(e).__name__}: {e}")
        traceback.print_exc()
        return

    # --- If Initialize succeeded, proceed to SSE connection and chat loop ---

    # 2. Establish SSE Connection (using the received session ID)
    logger.info(f"Attempting to establish SSE connection with session: {server_session_id}")
    sse_headers = get_mcp_headers(MCP_AGENT_SECRET, server_session_id) # Include session ID now
    logger.debug(f"SSE GET Headers: {sse_headers}")

    try:
        # Use the sse_client from the SDK for the GET stream
        async with sse_client(url=MCP_AGENT_URL, headers=sse_headers) as (read, write):
            logger.info("MCP SSE transport connected successfully.")

            # 3. Create ClientSession for ongoing communication over streams
            async with ClientSession(read, write) as session:
                active_session = session # Assign to outer scope variable if needed elsewhere, though passing via state is better
                logger.info(f"ClientSession created for ongoing communication (Session ID: {server_session_id})")

                # Start interactive loop
                print("Type 'quit' or 'exit' to end.")
                messages: List[BaseMessage] = [
                    SystemMessage(content="You are a helpful assistant. Use the available tools when necessary.")
                ]

                while True:
                    try:
                        user_input = input("You: ").strip()
                        if user_input.lower() in ["quit", "exit"]:
                            break
                        if not user_input:
                            continue

                        messages.append(HumanMessage(content=user_input))

                        graph_input = {
                            "messages": messages,
                            "mcp_session": active_session, # Pass the active session
                            "mcp_tool_schemas": tool_schemas # Pass pre-fetched schemas
                        }
                        logger.debug("--- Invoking LangGraph --- ")

                        final_state = await graph.ainvoke(graph_input)

                        if final_state:
                            final_response_message = final_state["messages"][-1]
                            if final_response_message not in messages:
                                messages.append(final_response_message)
                            print(f"Assistant: {final_response_message.content}")
                        else:
                             logger.error("Graph execution error.")
                             messages.append(AIMessage(content="Sorry, I encountered an issue processing the graph."))

                    except KeyboardInterrupt:
                        print("Exiting loop...")
                        break
                    except Exception as e:
                        logger.error(f"An error occurred in the chat loop: {e}")
                        traceback.print_exc()

    # Catch errors specific to the SSE connection attempt *after* successful init
    except httpx.HTTPStatusError as e:
        error_body = "<Could not read error body>"
        try: error_body = e.response.text
        except Exception: pass
        logger.error(f"Fatal Error: HTTP {e.response.status_code} establishing SSE connection (after init).")
        logger.error(f"Response body: {error_body}")
    except ConnectionRefusedError:
        logger.error(f"Fatal Error: Connection refused establishing SSE (after init) to {MCP_AGENT_URL}.")
    except Exception as e:
        logger.error(f"Fatal Error establishing SSE connection (after init): {type(e).__name__}: {e}")
        traceback.print_exc()
    finally:
        # Ensure cleanup if session was created but loop failed
        if active_session and not active_session.is_closed:
             logger.info("Attempting final session close.")
             await active_session.aclose()

    print("--- Agent Finished ---")


def main():
    """Synchronous entry point for the agent loop."""
    asyncio.run(run_agent_loop())

if __name__ == "__main__":
    main() 