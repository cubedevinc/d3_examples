import os
import uuid
import json
# import datetime # No longer needed directly here
# import httpx # No longer needed directly here
# import jwt # No longer needed directly here
import argparse
from typing import TypedDict, Annotated, Sequence, Any # Added Any
import operator
import re
from pydantic.types import SecretStr
# from httpx_sse import connect_sse # No longer needed directly here

# Langchain & Langgraph imports
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

# Import common components
from a2a_common import (
    BaseA2AClient,
    load_a2a_config,
    A2ACommunicationError,
    A2AHttpError,
    A2AStreamError
)

# --- Configuration ---
# Load A2A config using the common function
A2A_AGENT_URL, A2A_SECRET = load_a2a_config()

# Keep OpenAI specific config here
OPENAI_API_KEY_STR = os.getenv("OPENAI_API_KEY") # Read as string first
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini") # Default model

# Combine checks
if not OPENAI_API_KEY_STR:
    print("Error: Required environment variable OPENAI_API_KEY missing.")
    exit(1)

# Convert API key to SecretStr
OPENAI_API_KEY = SecretStr(OPENAI_API_KEY_STR)

# --- JWT Generation (Handled by BaseA2AClient) ---
# def generate_auth_token(secret: str) -> str: ... (Removed)
# AUTH_TOKEN = generate_auth_token(A2A_SECRET, ...) # type: ignore (Removed)
# HEADERS = { ... } (Removed)

# --- LLM Initialization ---
llm = ChatOpenAI(model=OPENAI_MODEL, temperature=0, api_key=OPENAI_API_KEY)

# --- A2A Payload Creation (Removed - Handled by BaseA2AClient methods) ---
# def create_a2a_send_payload(...): ...
# def create_a2a_subscribe_payload(...): ...

# --- LangGraph State Definition ---
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add] # type: ignore
    query_for_a2a: str | None
    a2a_result: str | None
    error: str | None
    # Add client instance to state for easy access in nodes?
    # Or instantiate it where needed? For now, instantiate in the node.

# --- LangGraph Node Definitions ---

# Define the prompt for the LLM agent
LLM_SYSTEM_PROMPT = """
You are a helpful assistant.
Your goal is to answer the user's query.
You have access to a specialized A2A (Agent-to-Agent) service that can fetch specific data.

If the user asks for data that you think the A2A agent can provide (e.g., specific metrics, reports, structured data), you should delegate the task to it.

To delegate, respond *only* with the following format:
DELEGATE_A2A: [Your query for the A2A agent based on the user's request]

Example:
User: What were the sales figures last month?
Your response: DELEGATE_A2A: Get sales figures for the previous calendar month.

If you can answer the query directly without needing the A2A agent, just provide the answer naturally.
If you receive information back from the A2A agent (prefixed with 'A2A Result:'), summarize it or present it to the user clearly.
"""

def call_llm_node(state: AgentState) -> dict:
    """Calls the OpenAI LLM to process the conversation or A2A result."""
    print("--- Node: call_llm_node --- ")
    messages = state['messages']
    # Ensure conversation starts with SystemMessage and uses lists for concatenation
    if len(messages) == 1 and isinstance(messages[0], HumanMessage):
        # Explicitly create lists for concatenation
        conversation: list[BaseMessage] = [SystemMessage(content=LLM_SYSTEM_PROMPT)] + list(messages)
    else:
        conversation = list(messages) # Ensure it's a list

    response = llm.invoke(conversation)

    # Check if the LLM wants to delegate, ensuring content is a string
    query_for_a2a = None
    if isinstance(response.content, str) and response.content.startswith("DELEGATE_A2A:"):
        match = re.search(r"DELEGATE_A2A:(.*)", response.content, re.DOTALL)
        if match:
            query_for_a2a = match.group(1).strip()
            print(f"LLM decided to delegate. Query for A2A: {query_for_a2a}")

    return {
        "messages": [response],
        "query_for_a2a": query_for_a2a,
        # Reset a2a_result and error if LLM runs successfully
        "a2a_result": None,
        "error": None
    }

def call_a2a_node(state: AgentState) -> dict[str, Any]: # Return type includes Any
    """Node that calls the external A2A agent using tasks/sendSubscribe via a2a_common."""
    print("--- Node: call_a2a_node (Streaming) --- ")
    query = state.get('query_for_a2a')
    if not query:
        print("ERROR: call_a2a_node called without a query.")
        return {"error": "A2A node called without query", "messages": [], "a2a_result": None}

    # Generate unique IDs for this specific call
    task_id = f"lg-task-{uuid.uuid4().hex[:12]}"
    session_id = f"lg-session-{uuid.uuid4().hex[:12]}"
    # payload = create_a2a_subscribe_payload(task_id, session_id, query) # Removed

    print(f"Sending tasks/sendSubscribe task {task_id} (query: \"{query}\") to {A2A_AGENT_URL}")

    # Instantiate the common client
    a2a_client = BaseA2AClient(A2A_AGENT_URL, A2A_SECRET, user_context="langgraph-a2a-example")

    accumulated_text_parts = []
    error_message = None
    event_received = False
    final_result_text = None
    system_message = None

    try:
        # Use the specific synchronous subscribe method from the common client
        for sse in a2a_client.send_subscribe_sync(task_id, query, session_id=session_id):
            event_received = True
            if sse.event == "error":
                try:
                    error_data = json.loads(sse.data)
                    error_message = f"A2A SSE Error Event: {error_data.get('message', sse.data)}"
                except json.JSONDecodeError:
                    error_message = f"A2A SSE Error Event: {sse.data}"
                print(f"ERROR: {error_message}")
                break
            elif sse.event == "close":
                print("  SSE Stream Closed by server.")
                break
            else:
                try:
                    data = json.loads(sse.data)
                    log_details = []
                    result_data = data.get("result")
                    if isinstance(result_data, dict):
                        status = result_data.get("status")
                        if isinstance(status, dict) and "state" in status:
                            log_details.append(f"State: {status['state']}")
                        if isinstance(status, dict):
                            message = status.get("message")
                            if isinstance(message, dict):
                                parts = message.get("parts")
                                if isinstance(parts, list):
                                    for part in parts:
                                        if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                                            log_details.append(f"Status Text: \"{part['text'][:80]}...\"")
                                            accumulated_text_parts.append(part["text"])
                        artifact = result_data.get("artifact")
                        if isinstance(artifact, dict):
                            if artifact.get("description"):
                                log_details.append(f"Artifact Desc: {artifact['description']}")
                            parts = artifact.get("parts")
                            if isinstance(parts, list):
                                for part in parts:
                                    if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                                        log_details.append(f"Artifact Text: \"{part['text'][:80]}...\"")
                                        accumulated_text_parts.append(part["text"])
                    if log_details:
                        print(f"  SSE Event: {sse.event}, Details: [{'; '.join(log_details)}]")
                    else:
                        print(f"  SSE Event: {sse.event}, Data: {sse.data[:100]}...")
                except json.JSONDecodeError:
                    print(f"  WARN: Received non-JSON SSE data: {sse.data}")
                except Exception as json_e:
                    print(f"  ERROR processing SSE JSON data: {json_e}")
        print("--- A2A Streaming Finished (Loop Completed) --- ")

    except A2AStreamError as e:
        error_message = f"A2A Streaming Error: {e}"
        print(f"ERROR: {error_message}")
    except A2AHttpError as e:
        # This might occur if the initial POST for SSE fails
        error_message = f"A2A Connection Error: {e}"
        print(f"ERROR: {error_message}")
    except Exception as e:
        # Catch other unexpected errors outside the loop or before it starts
        error_message = f"A2A Node Error: An unexpected error occurred: {e}"
        print(f"ERROR: {error_message}")

    # Process final result/error
    if error_message:
        system_message = SystemMessage(content=f"Error during A2A communication: {error_message}")
        return {"error": error_message, "messages": [system_message], "a2a_result": None}
    else:
        if not event_received:
            final_result_text = "A2A agent connection succeeded, but no events were received."
        elif not accumulated_text_parts:
            final_result_text = "A2A agent stream finished, but contained no text content."
        else:
            final_result_text = "\n".join(filter(None, accumulated_text_parts))
        
        print(f"--- Accumulated A2A Result Text --- \n{final_result_text}")
        # Create the SystemMessage *only* if there's a valid result
        system_message = SystemMessage(content=f"A2A Result: {final_result_text}")
        return {"a2a_result": final_result_text, "messages": [system_message], "error": None}

# --- Conditional Edge Logic ---
def should_call_a2a(state: AgentState) -> str:
    print("--- Condition: should_call_a2a --- ")
    # Check for error first - if A2A failed, end the graph
    if state.get('error'):
        print(f"Decision: Error detected ('{state['error']}'). Ending graph.")
        return END # type: ignore
    
    # If no error, check if LLM decided to delegate
    if state.get('query_for_a2a'):
        print("Decision: Route to A2A agent.")
        return "call_a2a_node"
    else:
        # If no query_for_a2a and no error, LLM answered directly, end graph
        print("Decision: No A2A query and no error. Ending graph.")
        return END # type: ignore

# --- Graph Definition --- 
workflow = StateGraph(AgentState)

workflow.add_node("call_llm_node", call_llm_node)
workflow.add_node("call_a2a_node", call_a2a_node)

workflow.set_entry_point("call_llm_node")

workflow.add_conditional_edges(
    "call_llm_node",
    should_call_a2a,
    {
        "call_a2a_node": "call_a2a_node",
        END: END
    }
)

# Edge from A2A node back to LLM to process the result
workflow.add_edge("call_a2a_node", "call_llm_node")

app = workflow.compile()

# --- Main Execution Logic ---
def run():
    # Add error handling for module resolution if a2a_common is not installed
    try:
        from a2a_common import BaseA2AClient # noqa: F401
    except ModuleNotFoundError:
        print("Error: The 'a2a_common' package was not found.")
        # Updated path suggestion
        print("Please install it from the 'a2a' directory, e.g., using: pip install -e ../../common")
        exit(1)

    parser = argparse.ArgumentParser(description="Run LangGraph A2A Agent Caller using a2a_common.")
    parser.add_argument("query", help="The initial query/prompt for the agent.")
    args = parser.parse_args()

    # Initial state includes the first user message
    initial_state = {
        "messages": [HumanMessage(content=args.query)],
        "query_for_a2a": None,
        "a2a_result": None,
        "error": None
    }

    print(f"\nInvoking graph with initial query: '{args.query}'")
    final_state_data = None
    try:
        # Stream events to see the flow
        for event in app.stream(initial_state):
            print("\n--- Graph Event --- ")
            # Attempt to pretty-print, handle potential non-serializable data
            try:
                print(json.dumps(event, indent=2, default=str))
            except TypeError:
                 print(event) # Fallback to default repr

            # Capture the latest state data from the stream
            if event:
                last_node = list(event.keys())[-1]
                # Ensure the data for the last node is a dictionary before accessing
                if isinstance(event[last_node], dict):
                    final_state_data = event[last_node]
            print("-"*20)

    except Exception as e:
        print(f"\n--- Graph Execution Error --- ")
        print(f"An error occurred during graph execution: {e}")
        # Optionally re-raise or exit
        # raise e
        exit(1)

    # Use the state captured from the stream
    final_state = final_state_data 

    print("\n--- Final State Data (from last stream event) --- ")
    if final_state and isinstance(final_state, dict):
         # Print the full final state for debugging
         print(json.dumps(final_state, indent=2, default=str))
         # Check for errors specifically
         if final_state.get('error'):
             print(f"\nGraph finished with error: {final_state['error']}")
         else:
             print("\nGraph finished successfully.")
             # You might want to print the last message if available and relevant
             # if 'messages' in final_state and final_state['messages']:
             #     last_message = final_state['messages'][-1]
             #     print(f"  Last Message ({last_message.type.upper()}): {last_message.content}")
    else:
        print("Could not determine final state from stream.")

# Ensure the script can be run directly
if __name__ == "__main__":
    run() 