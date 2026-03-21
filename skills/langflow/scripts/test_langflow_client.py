"""Langflow Client Tests"""

import json
import time
from unittest.mock import MagicMock, patch

import pytest
import requests


class TestLangflowClient:
    """LangflowClient 单元测试"""

    def test_init_with_base_url(self):
        """测试客户端初始化"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        assert client.base_url == "http://localhost:7860"
        assert client.token is None
        assert client.api_key is None

    def test_init_strips_trailing_slash(self):
        """测试移除尾部斜杠"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860/")
        assert client.base_url == "http://localhost:7860"

    def test_init_with_api_key(self):
        """测试使用 API Key 初始化"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        assert client.api_key == "sk-test-key"

    def test_init_with_token_and_api_key(self):
        """测试同时使用 Token 和 API Key"""
        from langflow_client import LangflowClient

        client = LangflowClient(
            "http://localhost:7860",
            token="jwt-token",
            api_key="sk-api-key"
        )
        assert client.token == "jwt-token"
        assert client.api_key == "sk-api-key"

    def test_headers_without_auth(self):
        """测试无认证的请求头"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        headers = client.headers
        assert "Authorization" not in headers
        assert "x-api-key" not in headers
        assert headers["Content-Type"] == "application/json"

    def test_headers_with_token(self):
        """测试带 token 的请求头"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        client.token = "test_token"
        headers = client.headers
        assert headers["Authorization"] == "Bearer test_token"

    def test_headers_with_api_key(self):
        """测试带 API Key 的请求头"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        headers = client.headers
        assert headers["x-api-key"] == "sk-test-key"

    def test_headers_with_both(self):
        """测试同时带 Token 和 API Key"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        client.token = "test_token"
        headers = client.headers
        assert headers["Authorization"] == "Bearer test_token"
        assert headers["x-api-key"] == "sk-test-key"

    def test_auth_headers_only(self):
        """测试仅认证头（不含 Content-Type）"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        headers = client.auth_headers
        assert "x-api-key" in headers
        assert "Content-Type" not in headers

    def test_is_authenticated_false(self):
        """测试未认证状态"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        assert client.is_authenticated() is False

    def test_is_authenticated_true_token(self):
        """测试 Token 认证状态"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        client.token = "test_token"
        assert client.is_authenticated() is True

    def test_is_authenticated_true_api_key(self):
        """测试 API Key 认证状态"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        assert client.is_authenticated() is True

    def test_generate_session_id(self):
        """测试生成 session_id"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        session_id = client.generate_session_id()
        assert session_id is not None
        assert len(session_id) > 0

    @patch("requests.Session.post")
    def test_login_success(self, mock_post):
        """测试登录成功"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "access_token": "test_access_token",
            "refresh_token": "test_refresh_token",
            "token_type": "bearer",
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        client = LangflowClient("http://localhost:7860")
        result = client.login("admin", "password123")

        assert result["access_token"] == "test_access_token"
        assert client.token == "test_access_token"
        mock_post.assert_called_once()

    @patch("requests.Session.post")
    def test_login_failure(self, mock_post):
        """测试登录失败"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("401 Unauthorized")
        mock_post.return_value = mock_response

        client = LangflowClient("http://localhost:7860")
        with pytest.raises(Exception):
            client.login("admin", "wrong_password")

    @patch("requests.Session.request")
    def test_list_components(self, mock_request):
        """测试获取组件列表"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {"results": [], "total": 0}
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        result = client.list_components()

        assert "results" in result

    @patch("requests.Session.request")
    def test_list_flows(self, mock_request):
        """测试获取 Flow 列表"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = []
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        result = client.list_flows()

        assert isinstance(result, list)

    @patch("requests.Session.request")
    def test_get_flow_by_name(self, mock_request):
        """测试通过名称查找 Flow"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"id": "flow-1", "name": "Test Flow"},
            {"id": "flow-2", "name": "Another Flow"},
        ]
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        flow = client.get_flow_by_name("Test Flow")

        assert flow is not None
        assert flow["id"] == "flow-1"

    @patch("requests.Session.request")
    def test_get_flow_by_name_not_found(self, mock_request):
        """测试通过名称查找不存在的 Flow"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = [{"id": "flow-1", "name": "Test Flow"}]
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        flow = client.get_flow_by_name("Non-existent Flow")

        assert flow is None

    @patch("requests.Session.request")
    def test_create_flow(self, mock_request):
        """测试创建 Flow"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "id": "test-flow-id",
            "name": "Test Flow",
            "description": "Test description",
        }
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        result = client.create_flow(
            name="Test Flow",
            description="Test description",
            data={"nodes": [], "edges": []},
        )

        assert result["name"] == "Test Flow"
        assert result["id"] == "test-flow-id"

    @patch("requests.Session.request")
    def test_enable_mcp(self, mock_request):
        """测试启用 MCP"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "id": "test-flow-id",
            "mcp_enabled": True,
            "endpoint_name": "my_tool",
        }
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        result = client.enable_mcp("test-flow-id", "my_tool", "Tool description")

        assert result["mcp_enabled"] is True
        assert result["endpoint_name"] == "my_tool"

    @patch("requests.Session.request")
    def test_delete_flow(self, mock_request):
        """测试删除 Flow"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        result = client.delete_flow("test-flow-id")

        assert "message" in result

    def test_logout_clears_token(self):
        """测试登出清除 token"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        client.token = "test_token"
        result = client.logout()

        assert client.token is None
        assert result["message"] == "Logged out successfully"

    def test_logout_keeps_api_key(self):
        """测试登出不清除 API Key"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        client.token = "test_token"
        client.logout()

        assert client.token is None
        assert client.api_key == "sk-test-key"

    @patch("requests.Session.request")
    def test_run_flow_with_auto_session_id(self, mock_request):
        """测试自动生成 session_id"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {"result": "ok"}
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")
        result = client.run_flow("flow-id", "Hello")

        # 验证 session_id 被自动添加
        call_args = mock_request.call_args
        json_body = call_args.kwargs["json"]
        assert "session_id" in json_body

    @patch("requests.Session.request")
    def test_execute_flow_by_name(self, mock_request):
        """测试通过名称执行"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {"result": "ok"}
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test-key")

        # Mock both get_flow_by_name's internal list_flows and the run_flow call
        with patch.object(
            client, "get_flow_by_name",
            return_value={"id": "flow-123", "name": "Test Flow"}
        ):
            with patch.object(
                client, "run_flow",
                return_value={"result": "ok"}
            ):
                result = client.execute_flow_by_name("Test Flow", "Hello")
                assert "result" in result


class TestLangflowClientNewFeatures:
    """LangflowClient 新增功能测试"""

    def test_connection_pool_init(self):
        """测试连接池初始化"""
        from langflow_client import ConnectionPool

        pool = ConnectionPool(max_connections=5, timeout=10)
        assert pool.max_connections == 5
        assert pool.timeout == 10

    def test_connection_pool_get_session(self):
        """测试获取会话"""
        from langflow_client import ConnectionPool

        pool = ConnectionPool(max_connections=5)
        session = pool.get_session()
        assert session is not None
        assert isinstance(session, requests.Session)

        # 再次获取应该是同一个实例
        session2 = pool.get_session()
        assert session is session2

    def test_connection_pool_context_manager(self):
        """测试连接池上下文管理器"""
        from langflow_client import ConnectionPool

        pool = ConnectionPool()
        with pool.session() as session:
            assert session is not None

    def test_connection_pool_close(self):
        """测试连接池关闭"""
        from langflow_client import ConnectionPool

        pool = ConnectionPool()
        session = pool.get_session()
        pool.close()
        # 关闭后再次获取应该创建新会话
        session2 = pool.get_session()
        assert session is not session2

    def test_query_history_init(self):
        """测试历史记录初始化"""
        from langflow_client import QueryHistory

        history = QueryHistory(max_size=50)
        assert history.max_size == 50
        assert history.get_all() == []

    def test_query_history_add(self):
        """测试添加历史记录"""
        from langflow_client import QueryHistory

        history = QueryHistory()
        history.add("flow-1", "Test Flow", "Hello", {"result": "ok"}, "rest")

        records = history.get_all()
        assert len(records) == 1
        assert records[0]["flow_id"] == "flow-1"
        assert records[0]["flow_name"] == "Test Flow"
        assert records[0]["method"] == "rest"

    def test_query_history_max_size(self):
        """测试历史记录大小限制"""
        from langflow_client import QueryHistory

        history = QueryHistory(max_size=3)
        for i in range(5):
            history.add(f"flow-{i}", f"Flow {i}", f"Input {i}", {"result": i})

        records = history.get_all()
        assert len(records) == 3
        assert records[0]["flow_id"] == "flow-4"

    def test_query_history_get_recent(self):
        """测试获取最近历史"""
        from langflow_client import QueryHistory

        history = QueryHistory()
        for i in range(10):
            history.add(f"flow-{i}", f"Flow {i}", f"Input {i}", {"result": i})

        recent = history.get_recent(3)
        assert len(recent) == 3

    def test_query_history_search(self):
        """测试搜索历史"""
        from langflow_client import QueryHistory

        history = QueryHistory()
        history.add("flow-1", "Chat Bot", "Hello", {"result": "ok"})
        history.add("flow-2", "RAG Bot", "Hi", {"result": "ok"})
        history.add("flow-3", "Agent", "Hey", {"result": "ok"})

        results = history.search("chat")
        assert len(results) == 1
        assert results[0]["flow_name"] == "Chat Bot"

    def test_query_history_clear(self):
        """测试清空历史"""
        from langflow_client import QueryHistory

        history = QueryHistory()
        history.add("flow-1", "Test", "Hello", {"result": "ok"})
        history.clear()
        assert len(history.get_all()) == 0

    def test_query_history_truncate_long_input(self):
        """测试截断长输入"""
        from langflow_client import QueryHistory

        history = QueryHistory()
        long_input = "x" * 200
        history.add("flow-1", "Test", long_input, {"result": "ok"})

        record = history.get_all()[0]
        assert len(record["input"]) == 100

    def test_client_with_connection_pool(self):
        """测试客户端使用连接池"""
        from langflow_client import LangflowClient

        client = LangflowClient(
            "http://localhost:7860",
            api_key="sk-test",
            max_connections=5,
            request_timeout=20,
        )
        assert client._pool.max_connections == 5
        assert client._pool.timeout == 20

    def test_client_token_refresh_expiry(self):
        """测试 Token 过期检查"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        client._token_expires_at = time.time() - 100  # 已过期

        assert client._should_refresh_token() is True

    def test_client_token_refresh_not_needed(self):
        """测试 Token 不需要刷新"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        client._token_expires_at = time.time() + 1000  # 还未过期

        assert client._should_refresh_token() is False

    def test_client_token_refresh_disabled(self):
        """测试 Token 刷新被禁用"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", auto_refresh_token=False)
        client._token_expires_at = time.time() - 100  # 已过期

        assert client._should_refresh_token() is False

    def test_client_update_token_expires_at(self):
        """测试更新 Token 过期时间"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860")
        before = time.time()
        client._update_token_expires_at()
        after = time.time()

        assert client._token_expires_at is not None
        assert before + 1700 <= client._token_expires_at <= after + 1900

    @patch("requests.Session.get")
    def test_health_check_success(self, mock_get):
        """测试健康检查成功"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test")
        result = client.health_check()

        assert result["status"] == "healthy"
        assert result["url"] == "http://localhost:7860"

    @patch("requests.Session.get")
    def test_health_check_failure(self, mock_get):
        """测试健康检查失败"""
        from langflow_client import LangflowClient, HealthCheckError

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_get.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test")
        with pytest.raises(HealthCheckError, match="Health check failed"):
            client.health_check()

    @patch("requests.Session.get")
    def test_health_check_timeout(self, mock_get):
        """测试健康检查超时"""
        from langflow_client import LangflowClient, HealthCheckError

        mock_get.side_effect = requests.Timeout()

        client = LangflowClient("http://localhost:7860", api_key="sk-test")
        with pytest.raises(HealthCheckError, match="timed out"):
            client.health_check()

    def test_exception_attributes(self):
        """测试自定义异常属性"""
        from langflow_client import LangflowError, AuthenticationError, FlowNotFoundError

        err = LangflowError("test message", code="TEST_CODE", details={"key": "value"})
        assert err.message == "test message"
        assert err.code == "TEST_CODE"
        assert err.details == {"key": "value"}

        auth_err = AuthenticationError("auth failed")
        assert auth_err.code is None

        not_found = FlowNotFoundError("not found")
        assert not_found.code is None

    def test_sanitize_log_data(self):
        """测试日志脱敏"""
        from langflow_client import _sanitize_log_data, _mask_sensitive

        # 测试 _mask_sensitive
        # 算法: len > 8 -> first4 + stars(len-8) + last4
        #       len <= 8 -> first2 + stars(len-2)
        assert _mask_sensitive("sk-1234567890abcdef") == "sk-1***********cdef"  # 18 chars, 11 stars
        assert _mask_sensitive("ab") == "ab"  # short, no masking
        assert _mask_sensitive("abcdefgh") == "ab******"  # 8 chars: first2 + 6 stars
        assert _mask_sensitive(None) is None

        # 测试 _sanitize_log_data
        data = {
            "password": "secret123",
            "api_key": "sk-1234567890abcdef",
            "token": "jwt-token-here",
            "username": "admin",
        }
        sanitized = _sanitize_log_data(data)

        # "secret123" (9 > 8) -> first4 + stars(1) + last4 = "secr*t123"
        assert sanitized["password"] == "secr*t123"
        assert sanitized["api_key"] == "sk-1***********cdef"
        # "jwt-token-here" (14 > 8) -> "jwt-" + 6 stars + "here" = "jwt-******here"
        assert sanitized["token"] == "jwt-******here"
        assert sanitized["username"] == "admin"

    def test_sanitize_log_data_case_insensitive(self):
        """测试日志脱敏大小写不敏感"""
        from langflow_client import _sanitize_log_data

        data = {
            "PASSWORD": "secret",
            "Api_Key": "sk-key",
            "TOKEN_value": "jwt",
        }
        sanitized = _sanitize_log_data(data)

        # "secret" (6 <= 8) -> "se****" (first2 + 4 stars)
        assert sanitized["PASSWORD"] == "se****"
        # "sk-key" (6 <= 8) -> "sk****" (first2 + 4 stars)
        assert sanitized["Api_Key"] == "sk****"
        # "jwt" (3 <= 8) -> "jw*" (first2 + 1 star)
        assert sanitized["TOKEN_value"] == "jw*"

    @patch("requests.Session.post")
    def test_refresh_token_success(self, mock_post):
        """测试刷新 Token 成功"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"access_token": "new_token"}
        mock_post.return_value = mock_response

        client = LangflowClient("http://localhost:7860", token="old_token")
        client._token_expires_at = time.time() - 100  # 已过期

        result = client.refresh_token_if_needed()

        assert result is True
        assert client.token == "new_token"

    @patch("requests.Session.post")
    def test_refresh_token_not_needed(self, mock_post):
        """测试不需要刷新 Token"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", token="valid_token")
        client._token_expires_at = time.time() + 1000  # 未过期

        result = client.refresh_token_if_needed()

        assert result is False
        mock_post.assert_not_called()

    def test_context_manager(self):
        """测试上下文管理器"""
        from langflow_client import LangflowClient

        with LangflowClient("http://localhost:7860", api_key="sk-test") as client:
            assert client.api_key == "sk-test"

        # close 应该被调用
        assert client._pool._session is None

    def test_close_method(self):
        """测试关闭方法"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test")
        client.close()

        assert client._pool._session is None

    @patch("requests.Session.request")
    def test_history_on_execute_flow(self, mock_request):
        """测试执行 Flow 时记录历史"""
        from langflow_client import LangflowClient

        mock_response = MagicMock()
        mock_response.json.return_value = {"result": "ok"}
        mock_response.raise_for_status = MagicMock()
        mock_request.return_value = mock_response

        client = LangflowClient("http://localhost:7860", api_key="sk-test")

        with patch.object(client, "get_flow", return_value={"id": "flow-123", "name": "Test"}):
            result = client.execute_flow("flow-123", "Hello")

            history = client.get_history(limit=1)
            assert len(history) == 1
            assert history[0]["flow_id"] == "flow-123"
            assert history[0]["flow_name"] == "Test"

    def test_export_result_json(self, tmp_path):
        """测试导出 JSON 结果"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test")

        result = {"outputs": [{"text": "Hello"}]}
        file_path = tmp_path / "result.json"
        saved_path = client.export_result_json(result, str(file_path))

        assert saved_path == str(file_path)
        assert file_path.exists()

        with open(file_path) as f:
            data = json.load(f)
            assert data["outputs"][0]["text"] == "Hello"

    def test_export_result_csv(self, tmp_path):
        """测试导出 CSV 结果"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test")

        data = [
            {"flow_id": "f1", "flow_name": "Test1", "result": "ok"},
            {"flow_id": "f2", "flow_name": "Test2", "result": "ok"},
        ]
        file_path = tmp_path / "result.csv"
        saved_path = client.export_result_csv(data, str(file_path))

        assert saved_path == str(file_path)
        assert file_path.exists()

        with open(file_path) as f:
            content = f.read()
            assert "flow_id" in content
            assert "Test1" in content

    def test_search_history(self):
        """测试搜索历史"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test")

        # 添加测试历史
        client._history.add("f1", "Chat Bot", "Hello", {"result": "ok"})
        client._history.add("f2", "RAG Bot", "Hi", {"result": "ok"})

        results = client.search_history("chat")
        assert len(results) == 1
        assert results[0]["flow_name"] == "Chat Bot"

    def test_clear_history(self):
        """测试清空历史"""
        from langflow_client import LangflowClient

        client = LangflowClient("http://localhost:7860", api_key="sk-test")
        client._history.add("f1", "Test", "Hello", {"result": "ok"})

        client.clear_history()
        assert len(client.get_history()) == 0
