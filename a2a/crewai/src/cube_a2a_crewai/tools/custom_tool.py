from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
from crewai.tools import tool
from cube_a2a_crewai.a2a.remote_agent_connection import (
    RemoteAgentConnections,
    TaskUpdateCallback
)
from cube_a2a_crewai.a2a.types import (
    Task,
    TaskSendParams,
    TaskStatus,
    TaskState,
    Message,
    TextPart,
    Part
)
from cube_a2a_crewai.a2a.card_resolver import A2ACardResolver
import uuid
import asyncio
import jwt
import datetime
import os
import logging

A2A_SECRET = os.getenv('A2A_SECRET') 

payload = {
    'context': {
       'user': 'foo'
     },
    'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)  # Token expires in 1 hour
}

AUTH_TOKEN = jwt.encode(payload, A2A_SECRET, algorithm='HS256') 

def convert_parts(parts: list[Part]):
  rval = []
  for p in parts:
    rval.append(convert_part(p))
  return rval

def convert_part(part: Part):
  if part.type == "text":
    return part.text
  elif part.type == "data":
    return part.data
  elif part.type == "file":
    raise NotImplementedError("File parts are not supported")
  return f"Unknown type: {part.type}"


class SendTaskToolInput(BaseModel):
    """Input schema for SendTaskTool."""
    agent_name: str = Field(..., description="The name of the agent to send the task to.")
    message: str = Field(..., description="The message to send to the agent for the task.")    

@tool("Send Task")
def send_task(agent_name: str, message: str) -> str:
    """Send a task to a remote agent."""
    try:
        address = os.getenv('A2A_AGENT_ADDRESS')

        if not address:
            raise ValueError("A2A_AGENT_ADDRESS is not set")

        logging.info(f"Resolving agent card from {address}")
        card_resolver = A2ACardResolver(address, authorization_token=AUTH_TOKEN)
        card = card_resolver.get_agent_card()
        logging.info(f"Initializing connection for agent: {card.name if card else 'Unknown'}")
        client = RemoteAgentConnections(card, AUTH_TOKEN)

        taskId = str(uuid.uuid4())
        sessionId = str(uuid.uuid4())
        metadata = {'conversation_id': sessionId} # Example metadata

        logging.info(f"Preparing TaskSendParams for task {taskId}")
        request: TaskSendParams = TaskSendParams(
            id=taskId,
            sessionId=sessionId,
            message=Message(
                role="user",
                parts=[TextPart(text=message)],
                metadata={}, # Agent specific metadata if needed
            ),
            acceptedOutputModes=["text", "text/plain"], # Adjust as needed
            metadata=metadata,
        )

        logging.info(f"Sending task {taskId} to agent {card.name if card else 'Unknown'}")
        task_result = asyncio.run(client.send_task(request)) # Renamed 'task' to avoid conflict
        logging.info(f"Received result for task {taskId}")

        response = []
        if task_result is None:
            logging.warning(f"Task {taskId} returned None result.")
            return "Error: Received no response from the remote agent."

        if task_result.status.message:
            logging.info(f"Processing status message for task {taskId}")
            response.extend(convert_parts(task_result.status.message.parts))

        if task_result.artifacts:
            logging.info(f"Processing {len(task_result.artifacts)} artifacts for task {taskId}")
            for artifact in task_result.artifacts:
                response.extend(convert_parts(artifact.parts))

        final_response = "\\n".join(map(str, response))
        logging.info(f"Task {taskId} completed successfully. Response length: {len(final_response)}")
        return final_response if final_response else "Received response, but it contained no processable parts."

    except ImportError as e:
        logging.error(f"ImportError in send_task: {e}. Please ensure all dependencies (crewai, pydantic, jwt, httpx) are installed.")
        return f"Error: Tool configuration issue due to missing library: {e}"
    except Exception as e:
        # Catch any other exceptions during the process
        logging.error(f"An unexpected error occurred in send_task for agent '{agent_name}': {e}", exc_info=True)
        # Provide a generic but informative error string back to the agent
        return f"Error: Failed to send task to agent '{agent_name}'. Reason: {type(e).__name__} - {e}"

# Ensure logging is configured somewhere in your application startup
# Example basic config:
# import logging
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
