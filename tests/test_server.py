"""In-memory tests for the MCP server (no network needed)."""

import pytest
from fastmcp import Client

from my_mcp_server import __version__
from my_mcp_server.server import mcp


@pytest.fixture
async def client():
    async with Client(mcp) as c:
        yield c


async def test_lists_tools(client: Client):
    tools = await client.list_tools()
    assert {t.name for t in tools} == {"hello", "echo", "delayed_echo"}


async def test_calls_hello(client: Client):
    result = await client.call_tool("hello", {"name": "World"})
    assert result.data == {"message": "Hello, World! Welcome to MCP."}


async def test_reports_package_version(client: Client):
    assert client.server_info.name == "my-mcp-server"
    assert client.server_info.version == __version__
