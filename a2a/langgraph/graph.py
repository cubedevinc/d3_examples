import os
import uuid
import json
import datetime
import httpx
import jwt
import argparse
from typing import TypedDict, Annotated, Sequence
import operator
import re
from pydantic.types import SecretStr
from httpx_sse import connect_sse # Import for A2A streaming

# Langchain & Langgraph imports
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

# --- Configuration & JWT ---
A2A_AGENT_URL = os.getenv("A2A_AGENT_URL")
A2A_SECRET = os.getenv("A2A_SECRET")
OPENAI_API_KEY_STR = os.getenv("OPENAI_API_KEY") # Read as string first
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini") # Default model

if not all([A2A_AGENT_URL, A2A_SECRET, OPENAI_API_KEY_STR]):
    print("Error: Required environment variables missing.")
    print("Please set: A2A_AGENT_URL, A2A_SECRET, OPENAI_API_KEY")
    exit(1)

# Convert API key to SecretStr
OPENAI_API_KEY = SecretStr(OPENAI_API_KEY_STR) if OPENAI_API_KEY_STR else None

def generate_auth_token(secret: str) -> str:
    payload = {
        'context': {'user': 'langgraph-a2a-example'},
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    }
    return jwt.encode(payload, secret, algorithm='HS256')

# The check above ensures A2A_SECRET is not None here
AUTH_TOKEN = generate_auth_token(A2A_SECRET) # type: ignore
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
}

# --- LLM Initialization ---
llm = ChatOpenAI(model=OPENAI_MODEL, temperature=0, api_key=OPENAI_API_KEY)

# --- A2A Payload Creation ---
# Keep this for potential future use or other nodes
def create_a2a_send_payload(task_id: str, session_id: str, message_text: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "tasks/send",
        "params": {
            "id": task_id,
            "sessionId": session_id,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": message_text, "metadata": None}],
                "metadata": {}
            },
            "metadata": {
                "conversation_id": session_id
            },
        },
        "id": f"req-lg-a2a-send-{uuid.uuid4().hex[:8]}",
    }

# New function for subscribe method
def create_a2a_subscribe_payload(task_id: str, session_id: str, message_text: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "tasks/sendSubscribe",
        "params": {
            "id": task_id,
            "sessionId": session_id,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": message_text, "metadata": None}],
                "metadata": {}
            },
            "metadata": {
                "conversation_id": session_id
            },
        },
        "id": f"req-lg-a2a-sub-{uuid.uuid4().hex[:8]}",
    }

# --- LangGraph State Definition ---
class AgentState(TypedDict):
    # Use type: ignore to address linter issue with operator.add and sequence types
    messages: Annotated[Sequence[BaseMessage], operator.add] # type: ignore
    query_for_a2a: str | None
    a2a_result: str | None
    error: str | None

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
        "query_for_a2a": query_for_a2a
    }

def call_a2a_node(state: AgentState) -> dict:
    """Node that calls the external A2A agent using tasks/sendSubscribe."""
    print("--- Node: call_a2a_node (Streaming) --- ")
    query = state.get('query_for_a2a')
    if not query:
        # Should not happen if routing logic is correct, but handle defensively
        print("ERROR: call_a2a_node called without a query.")
        return {"error": "A2A node called without query", "messages": []}

    task_id = f"lg-task-{uuid.uuid4().hex[:12]}"
    session_id = f"lg-session-{uuid.uuid4().hex[:12]}"
    payload = create_a2a_subscribe_payload(task_id, session_id, query)

    print(f"Sending tasks/sendSubscribe task {task_id} (query: \"{query}\") to {A2A_AGENT_URL}")

    accumulated_text_parts = []
    error_message = None
    event_received = False

    try:
        # Use httpx_sse for streaming
        with httpx.Client(headers=HEADERS, timeout=None) as client:
            # Add type: ignore as the check at the start ensures URL is not None
            with connect_sse(client, "POST", A2A_AGENT_URL, json=payload) as event_source: # type: ignore
                print("--- A2A Streaming Started --- ")
                for sse in event_source.iter_sse():
                    event_received = True
                    if sse.event == "error":
                        try:
                            error_data = json.loads(sse.data)
                            error_message = f"A2A SSE Error Event: {error_data.get('message', sse.data)}"
                        except json.JSONDecodeError:
                            error_message = f"A2A SSE Error Event: {sse.data}" # Use raw data if not JSON
                        print(f"ERROR: {error_message}")
                        break
                    elif sse.event == "close":
                        print("  SSE Stream Closed by server.")
                        break
                    else: # Default message event (e.g., status updates, artifacts)
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
                                # Fallback if no specific details extracted
                                print(f"  SSE Event: {sse.event}, Data: {sse.data[:100]}..." ) 

                        except json.JSONDecodeError:
                            print(f"  WARN: Received non-JSON SSE data: {sse.data}")
                        except Exception as json_e:
                            print(f"  ERROR processing SSE JSON data: {json_e}")
        print("--- A2A Streaming Finished --- ")

    except httpx.RequestError as e:
        error_message = f"A2A Connection Error: {e}"
        print(f"ERROR: {error_message}")
    except Exception as e:
        error_message = f"A2A Streaming Error: An unexpected error occurred: {e}"
        print(f"ERROR: {error_message}")

    # Process final result/error
    if error_message:
        system_message = SystemMessage(content=f"Error during A2A streaming: {error_message}")
        return {"error": error_message, "messages": [system_message]}
    else:
        if not event_received:
             final_result_text = "A2A agent connection succeeded, but no events were received."
        elif not accumulated_text_parts:
             final_result_text = "A2A agent stream finished, but contained no text content."
        else:
             final_result_text = "\n".join(filter(None, accumulated_text_parts))
        
        print(f"--- Accumulated A2A Result Text --- \n{final_result_text}")
        system_message = SystemMessage(content=f"A2A Result: {final_result_text}")
        return {"a2a_result": final_result_text, "messages": [system_message]}

# --- Conditional Edge Logic ---
def should_call_a2a(state: AgentState) -> str:
    print("--- Condition: should_call_a2a --- ")
    if state.get('query_for_a2a'):
        print("Decision: Route to A2A agent.")
        return "call_a2a_node"
    else:
        print("Decision: End graph.")
        # Return the actual END object, not the string "END"
        # Linter might still complain, but this is the correct LangGraph way
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

workflow.add_edge("call_a2a_node", "call_llm_node")

app = workflow.compile()

# --- Main Execution Logic ---
# Synchronous wrapper function to be used as the console script entry point
def run():
    parser = argparse.ArgumentParser(description="Run LangGraph A2A Agent Caller.")
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
    # Stream events to see the flow
    final_state_data = None
    for event in app.stream(initial_state):
        print("\n--- Graph Event --- ")
        print(event)
        # The last event before the graph finishes will contain the final updates
        # We can approximate the final state by taking the data from the last yielded event
        # Note: For complex graphs, merging states might be needed, but here the last event suffices
        if event:
             last_node = list(event.keys())[-1]
             final_state_data = event[last_node]
        print("-"*20)

    final_state = final_state_data # Use the state captured from the stream

    print("\n--- Final State Data (from last stream event) --- ")
    if final_state and 'messages' in final_state:
         print("Final Conversation:")
         # Note: final_state['messages'] here only contains the *last* message added
         # To get the full history, you would need to accumulate messages through the stream
         # or implement state merging if using a checkpointer. Printing the last message:
         last_message = final_state['messages'][-1]
         print(f"  {last_message.type.upper()}: {last_message.content}")
         # If you need the *full* final state object for debugging:
         # print(json.dumps(final_state, indent=2, default=str)) # Use default=str for BaseMessage
    else:
         print(json.dumps(final_state, indent=2, default=str)) # Use default=str

    if final_state and final_state.get('error'):
        print(f"\nGraph finished with error: {final_state['error']}")
    else:
        print("\nGraph finished.") 