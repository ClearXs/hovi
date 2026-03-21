"""Langflow HTTP API Client

完整的 Langflow API 客户端，支持多种认证方式和执行方法。
增强版本：包含 Token 自动刷新、超时控制、连接池、错误处理等。
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from typing import Any, Callable, Generator, Optional
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Try to import mcp client for integrated MCP support
try:
    from .mcp_client import LangflowMCPClient, LangflowMCPClientSSE
except ImportError:
    LangflowMCPClient = None
    LangflowMCPClientSSE = None


# 配置日志
logger = logging.getLogger(__name__)


def _mask_sensitive(value: str) -> str:
    """脱敏敏感信息"""
    if not value:
        return value
    # 掩码 API Key
    if len(value) > 8:
        return value[:4] + "*" * (len(value) - 8) + value[-4:]
    return value[:2] + "*" * (len(value) - 2)


def _sanitize_log_data(data: dict) -> dict:
    """清理日志数据，移除敏感信息"""
    if not data:
        return data
    sanitized = {}
    sensitive_keys = ["password", "api_key", "token", "secret", "authorization"]
    for key, value in data.items():
        key_lower = key.lower()
        if any(s in key_lower for s in sensitive_keys):
            if isinstance(value, str):
                sanitized[key] = _mask_sensitive(value)
            else:
                sanitized[key] = "***"
        else:
            sanitized[key] = value
    return sanitized


class LangflowError(Exception):
    """Langflow 客户端异常基类"""

    def __init__(self, message: str, code: Optional[str] = None, details: Optional[dict] = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(LangflowError):
    """认证错误"""
    pass


class FlowNotFoundError(LangflowError):
    """Flow 未找到"""
    pass


class TimeoutError(LangflowError):
    """请求超时"""
    pass


class HealthCheckError(LangflowError):
    """健康检查失败"""
    pass


class ConnectionPool:
    """连接池管理器"""

    def __init__(
        self,
        max_connections: int = 10,
        max_keepalive_connections: int = 5,
        timeout: int = 30,
    ):
        self.max_connections = max_connections
        self.max_keepalive_connections = max_keepalive_connections
        self.timeout = timeout
        self._session: Optional[requests.Session] = None
        self._executor: Optional[ThreadPoolExecutor] = None

    def get_session(self) -> requests.Session:
        """获取或创建会话"""
        if self._session is None:
            self._session = requests.Session()

            # 配置重试策略
            retry_strategy = Retry(
                total=3,
                backoff_factor=0.5,
                status_forcelist=[500, 502, 503, 504],
            )

            # 配置适配器
            adapter = HTTPAdapter(
                pool_connections=self.max_keepalive_connections,
                pool_maxsize=self.max_connections,
                max_retries=retry_strategy,
            )

            self._session.mount("http://", adapter)
            self._session.mount("https://", adapter)

        return self._session

    def get_executor(self) -> ThreadPoolExecutor:
        """获取线程池执行器"""
        if self._executor is None:
            self._executor = ThreadPoolExecutor(max_workers=self.max_connections)
        return self._executor

    def close(self):
        """关闭连接池"""
        if self._session:
            self._session.close()
            self._session = None
        if self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None

    @contextmanager
    def session(self) -> Generator[requests.Session, None, None]:
        """上下文管理器方式获取会话"""
        session = self.get_session()
        try:
            yield session
        finally:
            pass  # 会话复用，不关闭


class QueryHistory:
    """查询历史记录"""

    def __init__(self, max_size: int = 100):
        self.max_size = max_size
        self._history: list[dict[str, Any]] = []

    def add(
        self,
        flow_id: str,
        flow_name: str,
        input_value: str,
        result: Any,
        method: str = "rest",
    ):
        """添加历史记录"""
        record = {
            "id": str(uuid.uuid4()),
            "timestamp": time.time(),
            "flow_id": flow_id,
            "flow_name": flow_name,
            "input": input_value[:100] if len(input_value) > 100 else input_value,
            "result_preview": str(result)[:200] if result else None,
            "method": method,
        }
        self._history.insert(0, record)

        # 限制历史大小
        if len(self._history) > self.max_size:
            self._history = self._history[: self.max_size]

    def get_all(self) -> list[dict[str, Any]]:
        """获取所有历史"""
        return self._history.copy()

    def get_recent(self, limit: int = 10) -> list[dict[str, Any]]:
        """获取最近 N 条历史"""
        return self._history[:limit]

    def clear(self):
        """清空历史"""
        self._history = []

    def search(self, keyword: str) -> list[dict[str, Any]]:
        """搜索历史"""
        keyword_lower = keyword.lower()
        return [
            record
            for record in self._history
            if keyword_lower in record.get("flow_name", "").lower()
            or keyword_lower in record.get("input", "").lower()
        ]


class LangflowClient:
    """Langflow API 客户端

    用于与 Langflow 服务器进行交互，包括：
    - 用户认证（支持 Token 刷新）
    - 组件管理
    - Flow CRUD
    - 多种执行方法（REST API + MCP）
    - 连接池和并发控制
    - 友好的错误处理
    """

    # 默认超时配置
    DEFAULT_TIMEOUT = 30
    LONG_TIMEOUT = 300

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        token: Optional[str] = None,
        max_connections: int = 10,
        request_timeout: int = 30,
        auto_refresh_token: bool = True,
    ):
        """初始化客户端

        Args:
            base_url: Langflow 服务器地址，例如 http://localhost:7860
            api_key: API Key (推荐，用于 MCP 和 API 认证)
            token: JWT access_token (Bearer token)
            max_connections: 最大并发连接数
            request_timeout: 请求超时时间（秒）
            auto_refresh_token: 是否自动刷新 token
        """
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.api_key = api_key
        self.auto_refresh_token = auto_refresh_token

        # 初始化连接池
        self._pool = ConnectionPool(
            max_connections=max_connections,
            timeout=request_timeout,
        )

        # 初始化历史记录
        self._history = QueryHistory()

        # Token 过期时间（用于自动刷新）
        self._token_expires_at: Optional[float] = None

    @property
    def headers(self) -> dict[str, str]:
        """构建请求头"""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    @property
    def auth_headers(self) -> dict[str, str]:
        """构建仅包含认证信息的请求头"""
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    def _should_refresh_token(self) -> bool:
        """检查是否需要刷新 token"""
        if not self.auto_refresh_token or not self._token_expires_at:
            return False
        # 提前 5 分钟刷新
        return time.time() > self._token_expires_at - 300

    def _update_token_expires_at(self):
        """更新 token 过期时间"""
        # Langflow 默认 token 有效期约 30 分钟
        self._token_expires_at = time.time() + 1800

    def login(self, username: str, password: str) -> dict[str, Any]:
        """登录获取 access_token

        Args:
            username: 用户名
            password: 密码

        Returns:
            包含 access_token 和 refresh_token 的响应字典

        Raises:
            AuthenticationError: 登录失败时抛出
        """
        try:
            response = self._pool.get_session().post(
                f"{self.base_url}/api/v1/login",
                data={"username": username, "password": password},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=self.DEFAULT_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            self.token = data.get("access_token")
            self._update_token_expires_at()

            logger.info(f"Login successful for user: {username}")
            return data

        except requests.HTTPError as e:
            if e.response.status_code == 401:
                raise AuthenticationError(
                    "Login failed: Invalid username or password",
                    code="AUTH_FAILED",
                    details={"status": 401},
                )
            raise AuthenticationError(
                f"Login failed: {str(e)}",
                code="HTTP_ERROR",
                details={"status": e.response.status_code},
            )
        except requests.Timeout:
            raise TimeoutError(
                "Login request timed out",
                code="TIMEOUT",
            )
        except requests.RequestException as e:
            raise AuthenticationError(
                f"Login failed: {str(e)}",
                code="REQUEST_ERROR",
            )

    def refresh_token_if_needed(self) -> bool:
        """必要时刷新 token

        Returns:
            是否成功刷新
        """
        if not self._should_refresh_token():
            return False

        try:
            response = self._pool.get_session().post(
                f"{self.base_url}/api/v1/refresh",
                headers=self.auth_headers,
                timeout=self.DEFAULT_TIMEOUT,
            )
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self._update_token_expires_at()
                logger.info("Token refreshed successfully")
                return True
        except Exception as e:
            logger.warning(f"Token refresh failed: {e}")

        return False

    def logout(self) -> dict[str, str]:
        """登出，清除 token"""
        try:
            self._pool.get_session().post(
                f"{self.base_url}/api/v1/logout",
                headers=self.headers,
                timeout=self.DEFAULT_TIMEOUT,
            )
        except requests.RequestException:
            pass
        finally:
            self.token = None
            self._token_expires_at = None
        return {"message": "Logged out successfully"}

    def is_authenticated(self) -> bool:
        """检查是否已认证"""
        return self.token is not None or self.api_key is not None

    def health_check(self) -> dict[str, Any]:
        """健康检查

        Returns:
            健康状态

        Raises:
            HealthCheckError: 健康检查失败时抛出
        """
        try:
            response = self._pool.get_session().get(
                f"{self.base_url}/health",
                timeout=5,
            )

            if response.status_code == 200:
                return {"status": "healthy", "url": self.base_url}
            else:
                raise HealthCheckError(
                    f"Health check failed: status {response.status_code}",
                    code="UNHEALTHY",
                )

        except requests.Timeout:
            raise HealthCheckError(
                "Health check timed out",
                code="TIMEOUT",
            )
        except requests.RequestException as e:
            raise HealthCheckError(
                f"Health check failed: {str(e)}",
                code="CONNECTION_ERROR",
            )

    def generate_session_id(self) -> str:
        """生成一个新的会话 ID"""
        return str(uuid.uuid4())

    def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs,
    ) -> requests.Response:
        """统一的请求方法

        Args:
            method: HTTP 方法
            endpoint: API 端点
            **kwargs: 其他请求参数

        Returns:
            响应对象

        Raises:
            LangflowError: 请求失败时抛出
        """
        url = f"{self.base_url}{endpoint}"
        timeout = kwargs.pop("timeout", self.DEFAULT_TIMEOUT)

        # 自动刷新 token
        self.refresh_token_if_needed()

        # 脱敏日志
        log_data = kwargs.get("json", {})
        logger.debug(f"Request: {method} {url} - {_sanitize_log_data(log_data)}")

        try:
            response = self._pool.get_session().request(
                method=method,
                url=url,
                **kwargs,
                timeout=timeout,
            )

            logger.debug(f"Response: {response.status_code}")

            # 处理 HTTP 错误
            if response.status_code == 401:
                raise AuthenticationError(
                    "Authentication failed: Token may be expired",
                    code="UNAUTHORIZED",
                )
            elif response.status_code == 403:
                raise AuthenticationError(
                    "Access forbidden: Invalid API key or insufficient permissions",
                    code="FORBIDDEN",
                )
            elif response.status_code == 404:
                raise FlowNotFoundError(
                    f"Resource not found: {endpoint}",
                    code="NOT_FOUND",
                )

            response.raise_for_status()
            return response

        except requests.Timeout:
            raise TimeoutError(
                f"Request timed out: {method} {endpoint}",
                code="TIMEOUT",
            )
        except requests.HTTPError as e:
            error_msg = str(e)
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", error_msg)
            except Exception:
                pass

            raise LangflowError(
                f"Request failed: {error_msg}",
                code="HTTP_ERROR",
                details={"status": response.status_code, "endpoint": endpoint},
            )
        except requests.RequestException as e:
            raise LangflowError(
                f"Request failed: {str(e)}",
                code="REQUEST_ERROR",
            )

    # ==================== 组件管理 ====================

    def list_components(
        self,
        search: Optional[str] = None,
        is_component: Optional[bool] = None,
        tags: Optional[list[str]] = None,
        page: int = 1,
        limit: int = 100,
    ) -> dict[str, Any]:
        """获取组件列表"""
        params: dict[str, Any] = {"page": page, "limit": limit}
        if search:
            params["search"] = search
        if is_component is not None:
            params["is_component"] = is_component
        if tags:
            params["tags"] = tags

        response = self._request("GET", "/api/v1/store/components/", params=params)
        return response.json()

    def get_component(self, component_id: str) -> dict[str, Any]:
        """获取单个组件详情"""
        response = self._request("GET", f"/api/v1/store/components/{component_id}")
        return response.json()

    # ==================== Flow 管理 ====================

    def list_flows(
        self,
        folder_id: Optional[str] = None,
        get_all: bool = True,
    ) -> list[dict[str, Any]]:
        """获取用户的所有 Flows"""
        params: dict[str, Any] = {"get_all": get_all}
        if folder_id:
            params["folder_id"] = folder_id

        response = self._request("GET", "/api/v1/flows/", params=params)
        return self._parse_response(response)

    def get_flow(self, flow_id: str) -> dict[str, Any]:
        """获取 Flow 详情"""
        response = self._request("GET", f"/api/v1/flows/{flow_id}")
        return response.json()

    def get_flow_by_name(self, name: str) -> Optional[dict[str, Any]]:
        """通过名称查找 Flow"""
        flows = self.list_flows()
        for flow in flows:
            if flow.get("name") == name:
                return flow
        return None

    def create_flow(
        self,
        name: str,
        description: str = "",
        data: Optional[dict[str, Any]] = None,
        endpoint_name: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """创建 Flow"""
        payload: dict[str, Any] = {"name": name, "description": description}
        if data:
            payload["data"] = data
        if endpoint_name:
            payload["endpoint_name"] = endpoint_name
        if tags:
            payload["tags"] = tags

        response = self._request("POST", "/api/v1/flows/", json=payload)
        return response.json()

    def update_flow(self, flow_id: str, **kwargs) -> dict[str, Any]:
        """更新 Flow"""
        response = self._request("PUT", f"/api/v1/flows/{flow_id}", json=kwargs)
        return response.json()

    def delete_flow(self, flow_id: str) -> dict[str, str]:
        """删除 Flow"""
        self._request("DELETE", f"/api/v1/flows/{flow_id}")
        return {"message": "Flow deleted successfully"}

    def enable_mcp(
        self,
        flow_id: str,
        endpoint_name: str,
        action_description: str = "",
    ) -> dict[str, Any]:
        """启用 Flow 的 MCP 功能"""
        return self.update_flow(
            flow_id,
            mcp_enabled=True,
            endpoint_name=endpoint_name,
            action_description=action_description,
        )

    def disable_mcp(self, flow_id: str) -> dict[str, Any]:
        """禁用 Flow 的 MCP 功能"""
        return self.update_flow(flow_id, mcp_enabled=False)

    # ==================== Flow 执行 ====================

    def run_flow(
        self,
        flow_id_or_name: str,
        input_value: str,
        session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """运行 Flow（通过 REST API）"""
        if session_id is None:
            session_id = self.generate_session_id()

        payload = {
            "input_value": input_value,
            "session_id": session_id,
        }

        response = self._request(
            "POST",
            f"/api/v1/run/{flow_id_or_name}",
            json=payload,
            timeout=self.LONG_TIMEOUT,
        )
        return self._parse_response(response)

    def execute_flow(
        self,
        flow_id: str,
        input_value: str,
        session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """执行 Flow（推荐方法）"""
        # 验证 Flow 存在
        try:
            flow = self.get_flow(flow_id)
        except FlowNotFoundError:
            raise FlowNotFoundError(f"Flow with ID '{flow_id}' not found")

        result = self.run_flow(flow_id, input_value, session_id)

        # 记录历史
        self._history.add(
            flow_id=flow_id,
            flow_name=flow.get("name", "Unknown"),
            input_value=input_value,
            result=result,
            method="rest",
        )

        return result

    def execute_flow_by_name(
        self,
        flow_name: str,
        input_value: str,
        session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """通过名称执行 Flow"""
        flow = self.get_flow_by_name(flow_name)
        if not flow:
            raise FlowNotFoundError(f"Flow with name '{flow_name}' not found")

        return self.execute_flow(flow["id"], input_value, session_id)

    def _parse_response(self, response: requests.Response) -> Any:
        """解析响应，支持复杂嵌套结构"""
        try:
            return response.json()
        except json.JSONDecodeError:
            # 如果 JSON 解析失败，尝试返回文本
            return {"raw": response.text}

    # ==================== MCP 执行 ====================

    def get_mcp_client(self) -> Optional["LangflowMCPClient"]:
        """获取 MCP 客户端实例"""
        if LangflowMCPClient is None:
            return None

        return LangflowMCPClient(
            base_url=self.base_url,
            token=self.token,
            api_key=self.api_key,
        )

    def get_mcp_client_sse(self) -> Optional["LangflowMCPClientSSE"]:
        """获取 MCP SSE 客户端实例（支持流式）"""
        if LangflowMCPClientSSE is None:
            return None

        return LangflowMCPClientSSE(
            base_url=self.base_url,
            token=self.token,
            api_key=self.api_key,
        )

    def execute_via_mcp(
        self,
        tool_name: str,
        arguments: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """通过 MCP 执行 Flow"""
        mcp = self.get_mcp_client()
        if mcp is None:
            raise LangflowError("MCP client not available")

        try:
            result = mcp.call_tool(tool_name, arguments)

            # 记录历史
            self._history.add(
                flow_id=tool_name,
                flow_name=tool_name,
                input_value=str(arguments)[:100],
                result=result,
                method="mcp",
            )

            return result
        except RuntimeError as e:
            raise LangflowError(str(e), code="MCP_ERROR")

    def execute_via_mcp_text(
        self,
        tool_name: str,
        input_value: str,
    ) -> str:
        """通过 MCP 执行 Flow 并返回纯文本"""
        mcp = self.get_mcp_client()
        if mcp is None:
            raise LangflowError("MCP client not available")

        return mcp.call_tool_text(tool_name, input_value)

    # ==================== 智能执行 ====================

    def execute(
        self,
        flow_id_or_name: str,
        input_value: str,
        use_mcp: bool = False,
        session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """智能执行 Flow（自动选择最佳方法）"""
        if session_id is None:
            session_id = self.generate_session_id()

        errors = []

        # 方法 1: MCP 执行
        if use_mcp:
            try:
                result = self.execute_via_mcp(flow_id_or_name, {"input_value": input_value})
                return {"result": result, "method": "mcp"}
            except Exception as e:
                errors.append(f"MCP: {str(e)}")

        # 方法 2: 直接使用 ID/名称执行
        try:
            return self.run_flow(flow_id_or_name, input_value, session_id)
        except Exception as e:
            errors.append(f"REST API: {str(e)}")

        # 方法 3: 如果是名称，尝试查找后用 ID 执行
        try:
            flow = self.get_flow_by_name(flow_id_or_name)
            if flow:
                return self.execute_flow(flow["id"], input_value, session_id)
        except Exception as e:
            errors.append(f"By name: {str(e)}")

        raise LangflowError(
            f"Failed to execute flow '{flow_id_or_name}'",
            code="EXECUTION_FAILED",
            details={"errors": errors},
        )

    # ==================== 历史记录 ====================

    def get_history(self, limit: int = 10) -> list[dict[str, Any]]:
        """获取执行历史"""
        return self._history.get_recent(limit)

    def search_history(self, keyword: str) -> list[dict[str, Any]]:
        """搜索历史"""
        return self._history.search(keyword)

    def clear_history(self):
        """清空历史"""
        self._history.clear()

    # ==================== 结果导出 ====================

    def export_result_json(self, result: dict[str, Any], file_path: str) -> str:
        """导出结果为 JSON"""
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        return file_path

    def export_result_csv(
        self,
        data: list[dict[str, Any]],
        file_path: str,
    ) -> str:
        """导出结果为 CSV"""
        if not data:
            return file_path

        import csv

        keys = set()
        for item in data:
            keys.update(item.keys())

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=sorted(keys))
            writer.writeheader()
            writer.writerows(data)

        return file_path

    # ==================== 资源清理 ====================

    def close(self):
        """关闭客户端，释放资源"""
        self._pool.close()
        logger.info("LangflowClient closed")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
