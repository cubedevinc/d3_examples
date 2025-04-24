import httpx
import json
from typing import Dict, Any, Optional

from .config import get_d3_headers

# --- Exceptions ---
class D3ApiError(Exception):
    """Base exception for D3 API client errors."""
    pass

class D3HttpError(D3ApiError):
    """Exception for HTTP errors during D3 API communication."""
    def __init__(self, status_code: int, response_text: str):
        self.status_code = status_code
        self.response_text = response_text
        super().__init__(f"HTTP Error {status_code}: {response_text}")

# --- API Client ---
class D3ApiClient:
    """Client for interacting with D3 APIs"""
    
    def __init__(self, api_url: str, api_secret: str, user_context: str = "mcp-d3-example"):
        if not api_url:
            raise ValueError("api_url cannot be empty.")
        if not api_secret:
            raise ValueError("api_secret cannot be empty.")
            
        self.api_url = api_url
        self.api_secret = api_secret
        self.user_context = user_context
        self.headers = get_d3_headers(self.api_secret, self.user_context)
    
    def list_agents(self) -> Dict[str, Any]:
        """Fetch list of agents from D3 API"""
        try:
            with httpx.Client(headers=self.headers, timeout=30.0) as client:
                response = client.get(f"{self.api_url}/agents")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to fetch agents: {str(e)}")
    
    def get_agent(self, agent_id: str) -> Dict[str, Any]:
        """Get information about a specific agent"""
        try:
            with httpx.Client(headers=self.headers, timeout=30.0) as client:
                response = client.get(f"{self.api_url}/agents/{agent_id}")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to fetch agent {agent_id}: {str(e)}")
    
    def list_conversations(self, limit: int = 10) -> Dict[str, Any]:
        """Fetch list of recent conversations"""
        try:
            with httpx.Client(headers=self.headers, timeout=30.0) as client:
                response = client.get(f"{self.api_url}/conversations?limit={limit}")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to fetch conversations: {str(e)}")
    
    def get_conversation(self, conversation_id: str) -> Dict[str, Any]:
        """Get details about a specific conversation"""
        try:
            with httpx.Client(headers=self.headers, timeout=30.0) as client:
                response = client.get(f"{self.api_url}/conversations/{conversation_id}")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to fetch conversation {conversation_id}: {str(e)}")
    
    def send_message(self, agent_id: str, message: str, conversation_id: Optional[str] = None) -> Dict[str, Any]:
        """Send a message to an agent"""
        try:
            payload = {
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": message}]
                }
            }
            
            if conversation_id:
                url = f"{self.api_url}/agents/{agent_id}/conversations/{conversation_id}/messages"
            else:
                url = f"{self.api_url}/agents/{agent_id}/messages"
                
            with httpx.Client(headers=self.headers, timeout=30.0) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to send message: {str(e)}")
            
    async def list_agents_async(self) -> Dict[str, Any]:
        """Asynchronously fetch list of agents from D3 API"""
        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=30.0) as client:
                response = await client.get(f"{self.api_url}/agents")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to fetch agents: {str(e)}")
            
    async def get_agent_async(self, agent_id: str) -> Dict[str, Any]:
        """Asynchronously get information about a specific agent"""
        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=30.0) as client:
                response = await client.get(f"{self.api_url}/agents/{agent_id}")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to fetch agent {agent_id}: {str(e)}")
            
    async def send_message_async(self, agent_id: str, message: str, conversation_id: Optional[str] = None) -> Dict[str, Any]:
        """Asynchronously send a message to an agent"""
        try:
            payload = {
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": message}]
                }
            }
            
            if conversation_id:
                url = f"{self.api_url}/agents/{agent_id}/conversations/{conversation_id}/messages"
            else:
                url = f"{self.api_url}/agents/{agent_id}/messages"
                
            async with httpx.AsyncClient(headers=self.headers, timeout=30.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            raise D3HttpError(e.response.status_code, e.response.text)
        except Exception as e:
            raise D3ApiError(f"Failed to send message: {str(e)}")
