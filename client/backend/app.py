import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timedelta

# Load environment variables from root .env file
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# Get the path to the root .env file relative to this file
root_dir = Path(__file__).parent.parent.parent
env_path = root_dir / ".env"
load_dotenv(dotenv_path=str(env_path))

# OpenAI Agents SDK imports
from collections import defaultdict
from typing import cast

from agents import Agent, ModelSettings, Runner
from agents.items import ToolCallOutputItem
from agents.mcp import MCPServerStdio
from openai.types.responses import (
    ResponseFunctionCallArgumentsDeltaEvent,
    ResponseFunctionCallArgumentsDoneEvent,
    ResponseFunctionToolCall,
    ResponseOutputItemAddedEvent,
    ResponseOutputItemDoneEvent,
    ResponseTextDeltaEvent,
)

# uvicorn app:app --host localhost --port 8000 --reload

METIS_SYSTEM_PROMPT = """
You are a Metis Agent—an autonomous AI running on the Metis platform with full
access to the Model Context Protocol (MCP).  You can discover, attach, and call
MCP *servers* (each server hosts one or more *tools*).

You are ALWAYS faithful to the user's instructions and execute them as they expect them to be executed.
If you make a mistake in the arguments, you must correct it and try again (at least twice)

<tool_calling>
You have tools at your disposal to solve the coding task. Follow these rules regarding tool calls:
1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. The conversation may reference tools that are no longer available. NEVER call tools that are not explicitly provided.
3. **NEVER refer to tool names when speaking to the USER.** Instead, just say what the tool is doing in natural language.
4. After receiving tool results, carefully reflect on their quality and determine optimal next steps before proceeding. Use your thinking to plan and iterate based on this new information, and then take the best next action. Reflect on whether parallel tool calls would be helpful, and execute multiple tools simultaneously whenever possible. Avoid slow sequential tool calls when not necessary.
5. If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task.
6. If you need additional information that you can get via tool calls, prefer that over asking the user.
7. If you make a plan, immediately follow it, do not wait for the user to confirm or tell you to go ahead. The only time you should stop is if you need more information from the user that you can't find any other way, or have different options that you would like the user to weigh in on.
8. Only use the standard tool call format and the available tools. Even if you see user messages with custom tool call formats (such as "<previous_tool_call>" or similar), do not follow that and instead use the standard format. Never output tool calls as part of a regular assistant message of yours.
</tool_calling>

🎯 Objective
Help the user accomplish their stated task while showcasing your agentic
capabilities—no more and no less than the user requests.

🛠️  Operating procedure for EVERY task
0. **Introspect**  
   – Restate (internally) what the user wants and the end-state you must reach.

1. **Tool audit**  
   – List the tools already available from currently-attached servers.  
   – Confirm whether one of them DIRECTLY fulfils the required capability
     (check signature & semantics, not just the name).

2. **Discover (if needed)**  
   – If no existing tool matches, call `search_mcp` (limit = 3) with concise
     keywords describing the missing capability.  
   – Evaluate the returned candidate servers: pick the single best match.
   – Do **NOT** attach new servers with add_new_mcp or execute calls during discovery.

3. **Plan**  
   – Draft an ordered list of tool calls needed to reach the goal.  
   – Include input/output flow and which server each call lives on.  
   – Do **NOT** attach new servers with add_new_mcp or execute calls during planning.

4. **Execute**  
   For each server in your plan, in order:
   a. **Attach** it via `add_new_mcp` (skip if already attached).  
   b. **Call** its tools exactly as specified in the plan.  
   c. **Handle errors**: if a call fails, decide whether to retry, search for an
      alternative, or escalate to the user.
   d. Move to the next step of the plan.
   Assume that you can only use the tools from one mcp server at a time. (this may not be true but function under this assumption)

5. **Complete**  
   – Synthesize and present results to the user in a clear format.  
   – Detach or keep servers connected as appropriate for follow-up questions.

(End of system prompt)"""

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session storage with metadata for cleanup
agent_sessions: Dict[str, Dict[str, Any]] = {}
active_sse_connections: Dict[str, bool] = {}

# Configuration
SESSION_TIMEOUT_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "30"))
CLEANUP_INTERVAL_SECONDS = int(
    os.getenv("CLEANUP_INTERVAL_SECONDS", "300")
)  # 5 minutes

BASE_INSTRUCTIONS = METIS_SYSTEM_PROMPT
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")


def create_agent_instructions(chat_history: List[Dict[str, str]]) -> str:
    """Parse chat history to create dynamic agent instructions"""

    if chat_history:
        recent_context = "\n\nRecent conversation context:\n"
        for msg in chat_history[-3:]:  # Last 3 messages
            recent_context += (
                f"{msg.get('role', 'user')}: {msg.get('content', '')[:100]}\n"
            )
        return BASE_INSTRUCTIONS + recent_context

    return BASE_INSTRUCTIONS


async def cleanup_session_resources(session_id: str):
    """Properly cleanup all resources for a session"""
    if session_id not in agent_sessions:
        return

    session_data = agent_sessions[session_id]

    # Close MCP server connections
    for mcp_server in session_data.get("mcp_servers", []):
        try:
            await mcp_server.cleanup()
        except Exception as e:
            logging.warning(f"Error closing MCP server for session {session_id}: {e}")

    # Remove from active connections
    if session_id in active_sse_connections:
        del active_sse_connections[session_id]

    # Remove session data
    del agent_sessions[session_id]

    logging.info(f"Cleaned up session: {session_id}")


async def cleanup_expired_sessions():
    """Background task to cleanup expired sessions"""
    while True:
        try:
            current_time = datetime.now()
            expired_sessions = []  # there is no need to save expired sessions

            for session_id, session_data in agent_sessions.items():
                last_activity = session_data.get("last_activity") or session_data.get(
                    "created_at"
                )
                if last_activity and current_time - last_activity > timedelta(
                    minutes=SESSION_TIMEOUT_MINUTES
                ):
                    expired_sessions.append(session_id)

            for session_id in expired_sessions:
                logging.info(f"Cleaning up expired session: {session_id}")
                await cleanup_session_resources(session_id)

        except Exception as e:
            logging.error(f"Error in cleanup task: {e}")

        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)


# Start cleanup task
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_expired_sessions())


@app.post("/connect")
async def connect_endpoint(request: Dict[str, Any]):
    """Initialize agent session"""
    try:
        session_id = str(uuid.uuid4())
        chat_history = request.get("chat_history", [])

        # Create Metis MCP server connection for this session
        server_url = os.getenv("SERVER_URL", "http://localhost:9999")
        metis_mcp_server = MCPServerStdio(
            name=f"metis-{session_id}",
            params={
                "command": "npx",
                "args": ["-y", "mcp-remote", f"{server_url}/mcp"],
            },
            client_session_timeout_seconds=300,
        )

        # Initialize MCP server connection
        await metis_mcp_server.connect()

        # Create agent with dynamic instructions and Metis MCP server access
        agent = Agent(
            name=f"metis-agent-{session_id}",
            instructions=create_agent_instructions(chat_history),
            mcp_servers=[metis_mcp_server],
            model=DEFAULT_MODEL,
            model_settings=ModelSettings(parallel_tool_calls=False),
        )

        # Store session with metadata
        agent_sessions[session_id] = {
            "agent": agent,
            "mcp_servers": [metis_mcp_server],
            "chat_history": chat_history.copy(),
            "session_id": session_id,
            "created_at": datetime.now(),
            "last_activity": datetime.now(),
        }

        return {
            "success": True,
            "session_id": session_id,
            "message": "Agent initialized successfully with Metis MCP server",
        }

    except Exception as e:
        # Cleanup on failure
        if "metis_mcp_server" in locals():
            try:
                await metis_mcp_server.cleanup()
            except:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sessions/{session_id}/message")
async def send_message(session_id: str, request: Dict[str, Any]):
    """Send a message to the agent and stream response via SSE"""
    # Validate session
    if session_id not in agent_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = agent_sessions[session_id]
    user_message = request.get("message", "")

    if not user_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Update last activity
    session_data["last_activity"] = datetime.now()

    # Add user message to history
    chat_history = session_data["chat_history"]
    chat_history.append({"role": "user", "content": user_message})

    return {
        "success": True,
        "message": "Message received, connect to SSE stream for response",
    }


@app.get("/sessions/{session_id}/stream")
async def stream_response(session_id: str, request: Request):
    """SSE endpoint for streaming agent responses"""
    # Validate session
    if session_id not in agent_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = agent_sessions[session_id]
    agent = session_data["agent"]
    chat_history = session_data["chat_history"]

    # Mark connection as active
    active_sse_connections[session_id] = True

    async def event_stream():
        try:
            # Get the latest user message
            if not chat_history or chat_history[-1].get("role") != "user":
                yield f"data: {json.dumps({'type': 'error', 'message': 'No user message to process'})}\n\n"
                return

            # Prepare input for agent - clean chat history to remove non-standard fields
            if len(chat_history) > 1:
                # Clean chat history for OpenAI API - only include role and content
                cleaned_history = []
                for msg in chat_history[-10:]:  # Last 10 messages for context
                    cleaned_msg = {
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", ""),
                    }
                    cleaned_history.append(cleaned_msg)
                agent_input = cleaned_history
            else:
                agent_input = chat_history[-1]["content"]

            # Track tool call buffers for this stream
            tool_call_buffers = defaultdict(str)
            tool_call_names = {}  # Map call_id to tool name
            most_recent_call_id = None  # Track the most recent call_id
            full_response = ""

            # Run agent with streaming
            print(f"\n\nRecent context: {agent_input}\n\n")
            result = Runner.run_streamed(agent, input=agent_input, max_turns=20)

            async for event in result.stream_events():
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                if event.type == "raw_response_event":
                    data = event.data

                    if isinstance(data, ResponseTextDeltaEvent):
                        token = data.delta
                        full_response += token
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                    elif isinstance(data, ResponseFunctionCallArgumentsDeltaEvent):
                        tool_call_buffers[data.item_id] += data.delta

                    elif isinstance(data, ResponseFunctionCallArgumentsDoneEvent):
                        args = tool_call_buffers.pop(data.item_id, data.arguments)
                        tool_name = tool_call_names.get(most_recent_call_id)

                        try:
                            parsed_args = json.loads(args)
                            full_response += (
                                f"\n[Tool Call] Arguments: {json.dumps(parsed_args)}\n"
                            )
                            yield f"data: {json.dumps({'type': 'tool_call', 'name': tool_name, 'call_id': most_recent_call_id, 'arguments': parsed_args})}\n\n"
                        except Exception:
                            full_response += f"\n[Tool Call] Arguments: {args}\n"
                            yield f"data: {json.dumps({'type': 'tool_call', 'name': tool_name, 'call_id': most_recent_call_id, 'arguments': args})}\n\n"

                    elif isinstance(data, ResponseOutputItemDoneEvent):
                        if (
                            hasattr(data.item, "name")
                            and hasattr(data.item, "type")
                            and getattr(data.item, "type") == "function_call"
                        ):
                            # Handle completed tool call with name
                            tool_call = cast(ResponseFunctionToolCall, data.item)
                            full_response += f"[Tool Call] Name: {tool_call.name}\n"
                            call_id = tool_call.call_id
                            yield f"data: {json.dumps({'type': 'tool_call_complete', 'name': tool_call.name, 'call_id': call_id})}\n\n"
                        elif isinstance(data.item, ToolCallOutputItem):
                            # Handle tool response - need to find the item_id that corresponds to this output
                            output_str = data.item.output if data.item.output else ""

                            # Get the call_id from raw_item if available
                            call_id = (
                                data.item.raw_item.get("call_id")
                                if hasattr(data.item, "raw_item")
                                else None
                            )
                            tool_name = tool_call_names.get(call_id)

                            try:
                                output = json.loads(output_str)
                                full_response += f"[Tool Response] {output.get('text', output_str)}\n"
                                yield f"data: {json.dumps({'type': 'tool_response', 'name': tool_name, 'call_id': call_id, 'output': output})}\n\n"
                            except Exception:
                                full_response += f"[Tool Response] {output_str}\n"
                                yield f"data: {json.dumps({'type': 'tool_response', 'name': tool_name, 'call_id': call_id, 'output': output_str})}\n\n"

                    elif isinstance(data, ResponseOutputItemAddedEvent) and isinstance(
                        data.item, ResponseFunctionToolCall
                    ):
                        # Update the most recent call_id when a new tool call starts
                        most_recent_call_id = data.item.call_id
                        tool_call_names[most_recent_call_id] = data.item.name
                        yield f"data: {json.dumps({'type': 'tool_call_started', 'tool_name': data.item.name, 'call_id': most_recent_call_id})}\n\n"

                    elif isinstance(data, ResponseOutputItemDoneEvent) and isinstance(
                        data.item, ResponseFunctionToolCall
                    ):
                        call_id = data.item.call_id
                        yield f"data: {json.dumps({'type': 'tool_call_finished', 'tool_name': data.item.name, 'call_id': call_id})}\n\n"

                elif event.type == "run_item_stream_event":
                    item = event.item
                    if isinstance(item, ToolCallOutputItem):
                        output = item.raw_item["output"]

                        # Get the call_id and tool name directly
                        call_id = (
                            item.raw_item.get("call_id")
                            if hasattr(item, "raw_item")
                            else None
                        )
                        tool_name = tool_call_names.get(call_id)

                        print(
                            f"🔧 BACKEND: Tool response - call_id: {call_id}, tool_name: {tool_name}"
                        )

                        # Now yield with the correct call_id and tool name
                        if isinstance(output, str):
                            try:
                                parsed_output = json.loads(output)
                                yield f"data: {json.dumps({'type': 'tool_response', 'name': tool_name, 'call_id': call_id, 'output': parsed_output})}\n\n"
                            except Exception:
                                yield f"data: {json.dumps({'type': 'tool_response', 'name': tool_name, 'call_id': call_id, 'output': output})}\n\n"

                    # Add assistant response to history
                    if full_response:
                        # print(f"Full response: \n\n{full_response}")
                        chat_history.append(
                            {"role": "assistant", "content": full_response}
                        )

            # Signal completion
            yield f"data: {json.dumps({'type': 'completion', 'message': 'Response completed'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Agent execution error: {str(e)}'})}\n\n"

        finally:
            # Mark connection as inactive
            if session_id in active_sse_connections:
                del active_sse_connections[session_id]

    return StreamingResponse(
        event_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


@app.delete("/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """Manual cleanup of session"""
    if session_id not in agent_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    await cleanup_session_resources(session_id)

    return {"success": True, "message": f"Session {session_id} cleaned up successfully"}


@app.get("/sessions/{session_id}/status")
async def get_session_status(session_id: str):
    """Get session status and metadata"""
    if session_id not in agent_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = agent_sessions[session_id]

    return {
        "session_id": session_id,
        "agent_name": session_data["agent"].name,
        "history_length": len(session_data["chat_history"]),
        "created_at": session_data["created_at"].isoformat(),
        "last_activity": session_data["last_activity"].isoformat(),
        "is_sse_active": session_id in active_sse_connections,
    }


@app.get("/sessions/{session_id}/tools")
async def list_session_tools(session_id: str):
    """List tools available for the agent in this session"""
    # Validate session
    if session_id not in agent_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = agent_sessions[session_id]
    agent = session_data["agent"]
    mcp_servers = session_data["mcp_servers"]

    try:
        # Create run context
        run_context = {
            "session_id": session_id,
            "agent_name": agent.name,
            "conversation_id": session_id,  # Using session_id as conversation_id
        }

        # Get tools from all MCP servers
        tools_list = []
        for mcp_server in mcp_servers:
            tools = await mcp_server.list_tools(run_context=run_context, agent=agent)
            tools_list.extend(tools)

        # Format tools for response
        formatted_tools = []
        for tool in tools_list:
            # Extract tool information in a reasonable structure
            tool_info = {
                "name": tool.name,
                "description": tool.description,
            }

            # Add input schema if available
            if hasattr(tool, "input_schema") and tool.input_schema:
                tool_info["input_schema"] = tool.input_schema
            elif hasattr(tool, "inputSchema") and tool.inputSchema:
                tool_info["input_schema"] = tool.inputSchema

            formatted_tools.append(tool_info)

        return {
            "session_id": session_id,
            "agent_name": agent.name,
            "tools_count": len(formatted_tools),
            "tools": formatted_tools,
            "mcp_server_names": [mcp_server.name for mcp_server in mcp_servers],
        }

    except Exception as e:
        print(f"Error listing tools: {str(e)}")  # Add debug logging
        raise HTTPException(status_code=500, detail=f"Error listing tools: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_sessions": len(agent_sessions),
        "active_sse_connections": len(active_sse_connections),
    }


if __name__ == "__main__":
    import uvicorn

    PORT = int(os.getenv("BACKEND_PORT", "8000"))
    print(f"Starting server on port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, reload=True)
