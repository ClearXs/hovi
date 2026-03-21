"""MCP Client Tests"""

from unittest.mock import MagicMock, patch

import pytest
import requests


class TestLangflowMCPClient:
    """LangflowMCPClient 单元测试"""

    def test_init(self):
        """测试 MCP 客户端初始化"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", "test_token")
        assert client.base_url == "http://localhost:7860"
        assert client.token == "test_token"

    def test_init_with_api_key(self):
        """测试使用 API Key 初始化"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        assert client.api_key == "sk-test-key"

    def test_init_strips_trailing_slash(self):
        """测试移除尾部斜杠"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860/", "test_token")
        assert client.base_url == "http://localhost:7860"

    def test_headers_with_token(self):
        """测试带 token 的请求头"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", token="test_token")
        headers = client.headers
        assert headers["Authorization"] == "Bearer test_token"

    def test_headers_with_api_key(self):
        """测试带 API Key 的请求头"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        headers = client.headers
        assert headers["x-api-key"] == "sk-test-key"

    def test_headers_with_both(self):
        """测试同时带 Token 和 API Key"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient(
            "http://localhost:7860",
            token="jwt-token",
            api_key="sk-api-key"
        )
        headers = client.headers
        assert headers["Authorization"] == "Bearer jwt-token"
        assert headers["x-api-key"] == "sk-api-key"

    def test_send_json_rpc_basic(self):
        """测试 JSON-RPC 基本请求"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        with patch.object(client._session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {"result": "ok"}
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response

            result = client._send_json_rpc("tools/list")

            assert result == {"result": "ok"}

    def test_send_json_rpc_with_params(self):
        """测试带参数的 JSON-RPC 请求"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        with patch.object(client._session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {"result": {"content": []}}
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response

            result = client._send_json_rpc(
                "tools/call",
                {"name": "test_tool", "arguments": {"input_value": "hello"}},
            )

            # 验证请求体
            call_args = mock_post.call_args
            json_body = call_args.kwargs["json"]
            assert json_body["method"] == "tools/call"
            assert json_body["params"]["name"] == "test_tool"

    @patch("requests.Session.post")
    def test_call_tool(self, mock_post):
        """测试调用工具"""
        from mcp_client import LangflowMCPClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "result": {
                "content": [
                    {"type": "text", "text": "Hello, World!"}
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        results = client.call_tool("my_tool", {"input_value": "Hello"})

        assert len(results) > 0

    @patch("requests.Session.post")
    def test_call_tool_text(self, mock_post):
        """测试调用工具返回纯文本"""
        from mcp_client import LangflowMCPClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "result": {
                "content": [
                    {"type": "text", "text": "Response text"}
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        text = client.call_tool_text("my_tool", "Hello")

        assert "Response text" in text

    @patch("requests.Session.post")
    def test_call_tool_with_auto_input_value(self, mock_post):
        """测试自动提取 input_value"""
        from mcp_client import LangflowMCPClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "result": {
                "content": [
                    {"type": "text", "text": "Response"}
                ]
            }
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        # 传入 message 而不是 input_value
        results = client.call_tool("my_tool", {"message": "Hello"})

        # 验证 message 被转换为 input_value
        call_args = mock_post.call_args
        json_body = call_args.kwargs["json"]
        assert "input_value" in json_body["params"]["arguments"]

    def test_call_tool_403_error(self):
        """测试 403 错误处理"""
        from mcp_client import LangflowMCPClient
        import requests

        client = LangflowMCPClient("http://localhost:7860", api_key="invalid-key")

        # Create a proper HTTPError mock
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_error = requests.HTTPError(response=mock_response)

        with patch.object(client._session, "post") as mock_post:
            mock_post.return_value.raise_for_status.side_effect = mock_error

            with pytest.raises(RuntimeError, match="Authentication failed"):
                client.call_tool("my_tool", {"input_value": "Hello"})

    def test_call_tool_404_error(self):
        """测试 404 错误处理"""
        from mcp_client import LangflowMCPClient
        import requests

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        # Create a proper HTTPError mock
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_error = requests.HTTPError(response=mock_response)

        with patch.object(client._session, "post") as mock_post:
            mock_post.return_value.raise_for_status.side_effect = mock_error

            with pytest.raises(RuntimeError, match="not found"):
                client.call_tool("non_existent_tool", {"input_value": "Hello"})

    def test_parse_result_with_content(self):
        """测试解析包含 content 的结果"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        result = client._parse_result({
            "result": {
                "content": [
                    {"type": "text", "text": "Hello"}
                ]
            }
        })

        assert len(result) == 1
        assert result[0]["text"] == "Hello"

    def test_parse_result_without_content(self):
        """测试解析不包含 content 的结果"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        result = client._parse_result({"result": "simple string"})

        assert len(result) == 1
        assert "simple string" in result[0]["text"]

    def test_call_tool_with_auto_input_fallback(self):
        """测试自动提取 input_value fallback"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        with patch.object(client._session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "result": {
                    "content": [
                        {"type": "text", "text": "Response"}
                    ]
                }
            }
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response

            # 传入 query 参数
            results = client.call_tool("my_tool", {"query": "Hello"})

            # 验证 query 被转换为 input_value
            call_args = mock_post.call_args
            json_body = call_args.kwargs["json"]
            assert "input_value" in json_body["params"]["arguments"]

    def test_call_tool_with_message_fallback(self):
        """测试自动提取 message 参数"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        with patch.object(client._session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "result": {
                    "content": [
                        {"type": "text", "text": "Response"}
                    ]
                }
            }
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response

            # 传入 message 参数
            results = client.call_tool("my_tool", {"message": "Hello"})

            call_args = mock_post.call_args
            json_body = call_args.kwargs["json"]
            assert "input_value" in json_body["params"]["arguments"]

    def test_parse_result_with_empty_content(self):
        """测试解析空 content"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        result = client._parse_result({"result": {"content": []}})

        # 空 content 返回空列表
        assert result == []

    def test_parse_result_non_dict(self):
        """测试解析非字典结果"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        result = client._parse_result({"result": "plain string"})

        assert len(result) == 1
        assert result[0]["type"] == "text"

    def test_parse_result_no_result_key(self):
        """测试解析无 result 键的结果"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")
        result = client._parse_result({"error": "something"})

        assert len(result) == 1

    def test_call_tool_with_session_id_auto_generated(self):
        """测试自动生成 session_id"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        with patch.object(client._session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "result": {
                    "content": [
                        {"type": "text", "text": "Response"}
                    ]
                }
            }
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response

            result = client.call_tool_with_session("my_tool", "Hello")

            call_args = mock_post.call_args
            json_body = call_args.kwargs["json"]
            assert "session_id" in json_body["params"]["arguments"]
            assert len(json_body["params"]["arguments"]["session_id"]) > 0

    def test_call_tool_with_custom_session_id(self):
        """测试使用自定义 session_id"""
        from mcp_client import LangflowMCPClient

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        with patch.object(client._session, "post") as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "result": {
                    "content": [
                        {"type": "text", "text": "Response"}
                    ]
                }
            }
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response

            result = client.call_tool_with_session("my_tool", "Hello", session_id="custom-123")

            call_args = mock_post.call_args
            json_body = call_args.kwargs["json"]
            assert json_body["params"]["arguments"]["session_id"] == "custom-123"

    def test_call_tool_500_error(self):
        """测试 500 错误处理"""
        from mcp_client import LangflowMCPClient
        import requests

        client = LangflowMCPClient("http://localhost:7860", api_key="sk-test-key")

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_error = requests.HTTPError(response=mock_response)

        with patch.object(client._session, "post") as mock_post:
            mock_post.return_value.raise_for_status.side_effect = mock_error

            with pytest.raises(requests.HTTPError):
                client.call_tool("my_tool", {"input_value": "Hello"})


class TestLangflowMCPClientSSE:
    """LangflowMCPClientSSE 单元测试"""

    def test_init(self):
        """测试 SSE 客户端初始化"""
        from mcp_client import LangflowMCPClientSSE

        client = LangflowMCPClientSSE("http://localhost:7860", "test_token")
        assert client.base_url == "http://localhost:7860"
        assert client.token == "test_token"

    def test_inherits_from_base(self):
        """测试继承自基类"""
        from mcp_client import LangflowMCPClient, LangflowMCPClientSSE

        client = LangflowMCPClientSSE("http://localhost:7860", "test_token")
        assert isinstance(client, LangflowMCPClient)

    @patch("requests.Session.get")
    def test_list_tools_sse_fallback(self, mock_get):
        """测试 SSE 获取工具列表（降级模式）"""
        from mcp_client import LangflowMCPClientSSE

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        client = LangflowMCPClientSSE("http://localhost:7860", api_key="sk-test")

        # Mock ImportError for sseclient
        with patch("builtins.__import__", side_effect=ImportError("No module named 'sseclient'")):
            result = client.list_tools_sse()
            assert "warning" in result

    @patch("requests.Session.get")
    def test_list_tools_sse_connection_error(self, mock_get):
        """测试 SSE 连接失败"""
        from mcp_client import LangflowMCPClientSSE

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = requests.HTTPError()
        mock_get.return_value = mock_response

        client = LangflowMCPClientSSE("http://localhost:7860", api_key="sk-test")

        with pytest.raises(RuntimeError, match="Failed to connect"):
            client.list_tools_sse()

    def test_call_tool_stream_basic(self):
        """测试流式执行 Tool（降级到普通模式）"""
        from mcp_client import LangflowMCPClientSSE

        client = LangflowMCPClientSSE("http://localhost:7860", api_key="sk-test")

        with patch.object(client, "call_tool") as mock_call:
            mock_call.return_value = [{"type": "text", "text": "ok"}]
            result = client.call_tool_stream("my_tool", {"input_value": "Hello"})

            assert result == [{"type": "text", "text": "ok"}]
            mock_call.assert_called_once_with("my_tool", {"input_value": "Hello"})

    def test_call_tool_stream_with_error(self):
        """测试流式执行错误处理"""
        from mcp_client import LangflowMCPClientSSE

        client = LangflowMCPClientSSE("http://localhost:7860", api_key="sk-test")

        with patch.object(client, "call_tool", side_effect=RuntimeError("test error")):
            with pytest.raises(RuntimeError, match="Stream execution failed"):
                client.call_tool_stream("my_tool", {"input_value": "Hello"})

    def test_call_tool_stream_with_none_arguments(self):
        """测试流式执行空参数"""
        from mcp_client import LangflowMCPClientSSE

        client = LangflowMCPClientSSE("http://localhost:7860", api_key="sk-test")

        with patch.object(client, "call_tool") as mock_call:
            mock_call.return_value = [{"type": "text", "text": "ok"}]
            result = client.call_tool_stream("my_tool")

            assert result == [{"type": "text", "text": "ok"}]
