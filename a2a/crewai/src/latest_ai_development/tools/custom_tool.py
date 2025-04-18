from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
from crewai.tools import tool
from latest_ai_development.a2a.remote_agent_connection import (
    RemoteAgentConnections,
    TaskUpdateCallback
)
from latest_ai_development.a2a.types import (
    Task,
    TaskSendParams,
    TaskStatus,
    TaskState,
    Message,
    TextPart,
    Part
)
from latest_ai_development.a2a.card_resolver import A2ACardResolver
import uuid
import asyncio

AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudElkIjoxMywidGVuYW50SWQiOjI4Nzc2LCJ0ZW5hbnRVcmwiOiJodHRwczovL2QzLWFpLWRlbW8uY3ViZWNsb3VkLmRldiIsImRlcGxveW1lbnRJZCI6MSwidXNlcklkIjoyLCJjb25zb2xlU2VydmVyVG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKa1pYQnNiM2x0Wlc1MFNXUWlPakVzSW5SdmEyVnVUM2R1WlhJaU9pSmhhUzFsYm1kcGJtVmxjaUlzSW1saGRDSTZNVGMwTkRrek16QTJOaXdpWlhod0lqb3hOelEwT1RjMk1qWTJmUS43enBzZWoxSzNHcXdwcmlWUVdKX1RiWXZkYlVxbEVNR3FwaXVGc18wc3VjIiwiaWF0IjoxNzQ0OTMzMDY2LCJleHAiOjE3NDUwMTk0NjZ9.RTN1zB0QhYC9WG-BMb2_-K09aKXv6LpVhSxYf91pIYg"

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
    print(f"Sending task to {agent_name} with message: {message}")
    # if agent_name not in self.remote_agent_connections:
    #   raise ValueError(f"Agent {agent_name} not found")
    # state = tool_context.state
    # state['agent'] = agent_name
    # card = self.cards[agent_name]
    # client = self.remote_agent_connections[agent_name]
    # if not client:
    #   raise ValueError(f"Client not available for {agent_name}")
    address = "http://localhost:4201/api/a2a/d3-ai-demo/13"
    card_resolver = A2ACardResolver(address, authorization_token=AUTH_TOKEN)
    card = card_resolver.get_agent_card()
    client = RemoteAgentConnections(card)
    return card

    taskId = str(uuid.uuid4())
    sessionId = str(uuid.uuid4())
    task: Task
    messageId = ""
    metadata = {}

    request: TaskSendParams = TaskSendParams(
        id=taskId,
        sessionId=sessionId,
        message=Message(
            role="user",
            parts=[TextPart(text=message)],
            metadata=metadata,
        ),
        acceptedOutputModes=["text", "text/plain", "image/png"],
        # pushNotification=None,
        metadata={'conversation_id': sessionId},
    )
    task = asyncio.run(client.send_task(request))
    response = []
    if task.status.message:
      # Assume the information is in the task message.
      response.extend(convert_parts(task.status.message.parts))
    if task.artifacts:
      for artifact in task.artifacts:
        response.extend(convert_parts(artifact.parts))
    return response