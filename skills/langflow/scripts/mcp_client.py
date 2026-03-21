"""MCP Client for Langflow

This module provides MCP (Model Context Protocol) client functionality
for executing Langflow Flows.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import requests


class LangflowMCPClient:
    """Langflow MCP 客户端

    用于通过 MCP 协议执行 Langflow Flows。
    MCP 是 Anthropic 推出的模型上下文协议，用于 AI 与外部工具的交互。

    认证方式（按优先级）：
    1. API Key: 使用 x-api-key header（推荐，最可靠）
    2. Bearer token: 使用 JWT access_token

    注意：MCP 需要 Flow 已启用 MCP 功能并设置了 endpoint_name。
    """

    def __init__(
        self,
        base_url: str,
        token: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """初始化 MCP 客户端

        Args:
            base_url: Langflow 服务器地址
            token: JWT access_token (Bearer token)
            api_key: API Key (x-api-key) - 推荐使用
        """
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.api_key = api_key
        self._session = requests.Session()

    @property
    def headers(self) -> dict[str, str]:
        """构建请求头"""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    def _send_json_rpc(
        self,
        method: str,
        params: Optional[dict[str, Any]] = None,
        timeout: int = 300,
    ) -> dict[str, Any]:
        """发送 JSON-RPC 请求

        Args:
            method: MCP 方法名
            params: 方法参数
            timeout: 超时时间（秒）

        Returns:
            JSON-RPC 响应

        Raises:
            requests.HTTPError: 请求失败时抛出
        """
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
        }
        if params:
            payload["params"] = params

        response = self._session.post(
            f"{self.base_url}/api/v1/mcp/",
            json=payload,
            headers=self.headers,
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()

    def list_tools(self) -> list[dict[str, Any]]:
        """获取所有可用的 MCP Tools（Flows）

        返回已启用 MCP 功能的 Flow 列表。

        Returns:
            工具列表，每个工具包含 name, description, inputSchema

        Raises:
            requests.HTTPError: 请求失败时抛出
        """
        try:
            result = self._send_json_rpc("tools/list")
        except Exception as e:
            raise RuntimeError(
                f"Failed to list MCP tools. "
                f"Make sure Langflow is running and MCP is enabled. "
                f"Error: {str(e)}"
            ) from e

        tools = result.get("result", [])

        # 解析 tools/content 格式
        if isinstance(tools, dict):
            content = tools.get("content", [])
            if content and isinstance(content[0], dict):
                text = content[0].get("text", "[]")
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass

        # 如果 result 本身就是列表
        if isinstance(tools, list):
            return tools

        return []

    def call_tool(
        self,
        tool_name: str,
        arguments: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """执行 MCP Tool（Flow）

        Args:
            tool_name: 工具名称（Flow 的 endpoint_name 或 name）
            arguments: 工具参数

        Returns:
            执行结果列表

        Raises:
            requests.HTTPError: 请求失败时抛出
            RuntimeError: MCP 调用失败时抛出
        """
        if arguments is None:
            arguments = {}

        # 确保 input_value 存在
        if "input_value" not in arguments:
            # 尝试从其他参数中提取
            for key in ["input", "message", "text", "query"]:
                if key in arguments:
                    arguments["input_value"] = arguments.pop(key)
                    break

        try:
            result = self._send_json_rpc(
                "tools/call",
                {
                    "name": tool_name,
                    "arguments": arguments,
                }
            )
        except requests.HTTPError as e:
            if e.response.status_code == 403:
                raise RuntimeError(
                    "Authentication failed. Please provide a valid API key or token. "
                    "Error: 403 Forbidden"
                ) from e
            elif e.response.status_code == 404:
                raise RuntimeError(
                    f"MCP tool '{tool_name}' not found. "
                    "Make sure the Flow is created and MCP is enabled."
                ) from e
            raise

        # 解析结果
        return self._parse_result(result)

    def _parse_result(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """解析 MCP 返回结果"""
        if "result" not in result:
            return [{"type": "text", "text": str(result)}]

        result_data = result["result"]

        if isinstance(result_data, dict):
            content = result_data.get("content", [])
            if isinstance(content, list):
                parsed_results = []
                for item in content:
                    if isinstance(item, dict):
                        if item.get("type") == "text":
                            parsed_results.append({
                                "type": "text",
                                "text": item.get("text", ""),
                            })
                        else:
                            parsed_results.append(item)
                return parsed_results

            # 如果没有 content 字段，返回整个 result
            return [{"type": "text", "text": str(result_data)}]

        return [{"type": "text", "text": str(result_data)}]

    def call_tool_text(self, tool_name: str, input_value: str) -> str:
        """执行 Tool 并返回纯文本结果

        这是一个便捷方法，适用于简单的 Flow 执行场景。

        Args:
            tool_name: 工具名称
            input_value: 输入值

        Returns:
            执行结果的文本内容

        Raises:
            RuntimeError: MCP 调用失败时抛出
        """
        results = self.call_tool(tool_name, {"input_value": input_value})

        # 提取文本内容
        text_parts = []
        for result in results:
            if isinstance(result, dict):
                text = result.get("text", "")
                if text:
                    text_parts.append(text)
            elif isinstance(result, str):
                text_parts.append(result)

        return "\n".join(text_parts)

    def call_tool_with_session(
        self,
        tool_name: str,
        input_value: str,
        session_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """使用会话 ID 执行 Tool

        Args:
            tool_name: 工具名称
            input_value: 输入值
            session_id: 会话 ID（如果为 None，将自动生成）

        Returns:
            执行结果列表
        """
        if session_id is None:
            session_id = str(uuid.uuid4())

        return self.call_tool(tool_name, {
            "input_value": input_value,
            "session_id": session_id,
        })


class LangflowMCPClientSSE(LangflowMCPClient):
    """基于 SSE 的 MCP 客户端

    使用 Server-Sent Events 进行实时通信，
    适用于需要流式输出的场景。
    """

    def list_tools_sse(self) -> dict[str, Any]:
        """通过 SSE 获取工具列表

        Returns:
            工具列表

        Raises:
            RuntimeError: SSE 连接失败时抛出
        """
        try:
            response = self._session.get(
                f"{self.base_url}/api/v1/mcp/sse",
                headers=self.headers,
                stream=True,
                timeout=30,
            )
            response.raise_for_status()
        except requests.HTTPError as e:
            raise RuntimeError(
                f"Failed to connect to MCP SSE endpoint. "
                f"Make sure Langflow is running. "
                f"Error: {str(e)}"
            ) from e

        tools = {}
        try:
            import sseclient
            client = sseclient.SSEClient(response)

            for event in client.events():
                if event.event == "tools":
                    data = json.loads(event.data)
                    if isinstance(data, list):
                        for tool in data:
                            if isinstance(tool, dict):
                                name = tool.get("name")
                                if name:
                                    tools[name] = tool
                    break
        except ImportError:
            # 如果没有 sseclient，降级到普通模式
            return {"warning": "sseclient not installed, using REST fallback"}
        except Exception as e:
            raise RuntimeError(f"SSE parsing error: {str(e)}") from e

        return tools

    def call_tool_stream(
        self,
        tool_name: str,
        arguments: Optional[dict[str, Any]] = None,
    ) -> Any:
        """流式执行 Tool

        注意：这是一个简化实现，
        完整的流式支持需要更复杂的 SSE 处理逻辑。

        Args:
            tool_name: 工具名称
            arguments: 工具参数

        Returns:
            执行结果

        Raises:
            RuntimeError: 流式执行失败时抛出
        """
        # 暂时使用普通模式
        try:
            return self.call_tool(tool_name, arguments)
        except Exception as e:
            raise RuntimeError(f"Stream execution failed: {str(e)}") from e
