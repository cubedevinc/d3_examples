import os
import uuid
import json
import argparse
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

# Import FastMCP components
from mcp.server.fastmcp import FastMCP
from mcp.server.types import OutputMode

# Import common components
from common import (
    D3ApiClient,
    D3ApiError,
    D3HttpError,
    load_d3_config,
)

# Load environment variables
load_dotenv()

# --- Configuration ---
# MCP configuration
MCP_URL = os.getenv("MCP_URL", "http://localhost:8080")
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"

# Load D3 config using the common function
D3_API_URL, D3_API_SECRET = load_d3_config()

# Create D3 API client
d3_client = D3ApiClient(D3_API_URL, D3_API_SECRET, user_context="fastmcp-d3-example")

# --- MCP Server Setup ---
mcp = FastMCP(
    "Cube D3 Integration",
    debug=DEBUG_MODE,
    description="A demonstration of Cube D3 integration with MCP protocol"
)

# --- MCP Resources ---
@mcp.resource("agents")
def get_agents() -> Dict[str, Any]:
    """Get list of available agents from D3"""
    try:
        return d3_client.list_agents()
    except (D3ApiError, D3HttpError) as e:
        return {"error": str(e)}

@mcp.resource("agents/{agent_id}")
def get_agent_details(agent_id: str) -> Dict[str, Any]:
    """Get details about a specific agent"""
    try:
        return d3_client.get_agent(agent_id)
    except (D3ApiError, D3HttpError) as e:
        return {"error": str(e)}

@mcp.resource("conversations")
def get_conversations() -> Dict[str, Any]:
    """Get list of recent conversations"""
    try:
        return d3_client.list_conversations()
    except (D3ApiError, D3HttpError) as e:
        return {"error": str(e)}

@mcp.resource("conversations/{conversation_id}")
def get_conversation_details(conversation_id: str) -> Dict[str, Any]:
    """Get details about a specific conversation"""
    try:
        return d3_client.get_conversation(conversation_id)
    except (D3ApiError, D3HttpError) as e:
        return {"error": str(e)}

# --- MCP Tools ---
@mcp.tool()
def send_message_to_agent(agent_id: str, message: str, conversation_id: Optional[str] = None) -> Dict[str, Any]:
    """Send a message to a D3 agent"""
    try:
        return d3_client.send_message(agent_id, message, conversation_id)
    except (D3ApiError, D3HttpError) as e:
        return {"error": str(e)}

@mcp.tool()
def fetch_more_conversations(limit: int = 20) -> Dict[str, Any]:
    """Fetch more conversations with a specified limit"""
    try:
        return d3_client.list_conversations(limit)
    except (D3ApiError, D3HttpError) as e:
        return {"error": str(e)}

# --- Define Custom Prompts ---
agent_analysis_template = """
# D3 Agent Analysis

Analyze the following agent information and provide insights:

{agent_data}

Focus on:
1. Agent capabilities
2. Primary use cases
3. Key features
"""

@mcp.prompt("agent_analysis")
def agent_analysis(agent_id: str) -> str:
    """Generate a prompt for analyzing a specific agent"""
    try:
        agent_data = json.dumps(d3_client.get_agent(agent_id), indent=2)
        return agent_analysis_template.format(agent_data=agent_data)
    except (D3ApiError, D3HttpError) as e:
        return f"Error fetching agent data: {str(e)}"

conversation_analysis_template = """
# Conversation Analysis

Review the following conversation and provide insights:

{conversation_data}

Provide a summary of:
1. Main topics discussed
2. Key decisions or outcomes
3. Sentiment analysis
"""

@mcp.prompt("conversation_analysis")
def conversation_analysis(conversation_id: str) -> str:
    """Generate a prompt for analyzing a conversation"""
    try:
        conversation_data = json.dumps(d3_client.get_conversation(conversation_id), indent=2)
        return conversation_analysis_template.format(conversation_data=conversation_data)
    except (D3ApiError, D3HttpError) as e:
        return f"Error fetching conversation data: {str(e)}"

# --- Server Running Function ---
def run_server(host: str = "localhost", port: int = 8080):
    """Run the MCP server"""
    print(f"Starting MCP server on {host}:{port}...")
    mcp.run(host=host, port=port)

# --- Command Line Interface ---
def main():
    parser = argparse.ArgumentParser(description="Run the Cube D3 FastMCP example server")
    parser.add_argument("--host", default="localhost", help="Host to run the server on")
    parser.add_argument("--port", type=int, default=8080, help="Port to run the server on")
    parser.add_argument("--debug", action="store_true", help="Run in debug mode")
    
    args = parser.parse_args()
    
    # Update debug mode if specified
    if args.debug:
        mcp.debug = True
        
    # Run the server
    run_server(host=args.host, port=args.port)

if __name__ == "__main__":
    main()
