from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
from crewai.tools import tool

from common import (
    BaseA2AClient,
    load_a2a_config
)

import uuid
import logging

class SendTaskToolInput(BaseModel):
    """Input schema for SendTaskTool."""
    agent_name: str = Field(..., description="The name of the agent to send the task to.")
    message: str = Field(..., description="The message to send to the agent for the task.")    

@tool("Send Task")
def send_task(agent_name: str, message: str) -> str:
    """Send a task to a remote agent."""

    try:
        a2a_agent_url, a2a_secret = load_a2a_config()
        a2a_client = BaseA2AClient(a2a_agent_url, a2a_secret, user_context="langgraph-a2a-example")

        taskId = str(uuid.uuid4())
        sessionId = str(uuid.uuid4())

        response = a2a_client.send_task_sync(taskId, message, sessionId)

        return response
    except Exception as e:
        # Catch any other exceptions during the process
        logging.error(f"An unexpected error occurred in send_task for agent '{agent_name}': {e}", exc_info=True)
        # Provide a generic but informative error string back to the agent
        return f"Error: Failed to send task to agent '{agent_name}'. Reason: {type(e).__name__} - {e}"

