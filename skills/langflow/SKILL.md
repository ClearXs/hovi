---
name: langflow
description: |
  当用户想要使用 Langflow AI 工作流平台时使用此技能。

  功能包括：
  1. 用户认证 - 登录 Langflow 服务器（支持 Token 和 API Key）
  2. 组件探索 - 查看和管理可用组件
  3. Flow 管理 - 创建、编辑、删除 Flows
  4. Flow 执行 - 多种执行方法（REST API + MCP）

  适用场景：
  - 构建聊天机器人
  - 创建知识库问答系统
  - 开发 AI 助手应用
  - 自动化工作流

  认证要求：
  - Langflow v1.5+ 需要有效的 API Key 或 Token
  - 推荐使用 API Key 认证（最可靠）
---

# Langflow Skill

## 概述

此技能帮助用户使用 Langflow 平台完成以下任务：

1. 登录认证（支持多种方式）
2. 查看可用组件
3. 创建和管理 Flows
4. 执行 Flows 获取结果（多种方法）

## 认证流程

### 认证方式

Langflow v1.5+ 支持以下认证方式（按优先级）：

#### 方式 1: API Key（推荐）

1. 在 Langflow UI 中生成 API Key：
   - 登录 Langflow
   - 进入 Settings → API Keys
   - 创建新的 API Key

2. 使用 API Key 初始化客户端：

```python
from langflow_client import LangflowClient

client = LangflowClient(
    base_url="http://localhost:7860",
    api_key="sk-your-api-key-here"
)
```

#### 方式 2: 用户名密码登录

```python
from langflow_client import LangflowClient

client = LangflowClient("http://localhost:7860")
client.login("langflow", "langflow")
```

#### 方式 3: Bearer Token

```python
from langflow_client import LangflowClient

client = LangflowClient(
    base_url="http://localhost:7860",
    token="your-jwt-token"
)
```

### 认证注意事项

- **Langflow v1.5+**: 需要有效的 API Key 或 Token
- **LANGFLOW_SKIP_AUTH_AUTO_LOGIN=false**: MCP 调用需要 API Key
- **LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true**: 可跳过认证检查

## 组件管理

### 获取组件列表

```python
# 获取所有组件
components = client.list_components()

# 搜索组件
chat_components = client.list_components(search="chat")

# 获取组件详情
component = client.get_component(component_id)
```

## Flow 管理

### 创建 Flow

```python
from flow_builder import FlowBuilder

# 构建 Flow 数据
builder = FlowBuilder()
builder.add_node("ChatInput", {"x": 100, "y": 100})
builder.add_node("ChatOutput", {"x": 500, "y": 100})
builder.connect("ChatInput", "ChatOutput", "message", "input_value")

flow_data = builder.build()

# 创建 Flow
flow = client.create_flow(
    name="My Chat Bot",
    description="A simple chat bot",
    data=flow_data
)

flow_id = flow["id"]
```

### 启用 MCP 功能

```python
# 启用 MCP，设置为可调用
client.enable_mcp(
    flow_id=flow_id,
    endpoint_name="my_chat_bot",
    action_description="Simple chat bot"
)
```

### 列出 Flows

```python
# 列出所有 Flows
flows = client.list_flows()

# 通过名称查找 Flow
flow = client.get_flow_by_name("My Chat Bot")
```

## Flow 执行

### 方法 1: REST API（推荐，最可靠）

```python
# 使用 Flow ID 执行
result = client.execute_flow(
    flow_id="uuid-of-flow",
    input_value="Hello, World!"
)

# 使用名称执行
result = client.execute_flow_by_name(
    flow_name="My Chat Bot",
    input_value="Hello!"
)
```

### 方法 2: MCP 调用

```python
# 获取 MCP 客户端
mcp = client.get_mcp_client()

# 列出可用工具
tools = mcp.list_tools()

# 执行工具
result = mcp.call_tool("my_chat_bot", {"input_value": "Hello!"})

# 或使用便捷方法
text = mcp.call_tool_text("my_chat_bot", "Hello!")
```

### 方法 3: 智能执行（自动选择最佳方法）

```python
# 自动尝试多种执行方法
result = client.execute(
    flow_id_or_name="my_chat_bot",
    input_value="Hello!",
    use_mcp=False  # 优先使用 REST API
)
```

### 执行结果解析

```python
result = client.execute_flow_by_name("My Chat Bot", "Hello!")

# 解析输出
if "outputs" in result:
    for output in result["outputs"]:
        for component_output in output.get("outputs", []):
            for msg in component_output.get("messages", []):
                print(msg["message"])
```

## 错误处理与备用方案

### 常见错误及解决方案

#### 错误 1: 403 Forbidden - API Key required

**原因**: Langflow v1.5+ 需要有效的 API Key

**解决方案**:

```python
# 使用 API Key
client = LangflowClient(
    base_url="http://localhost:7860",
    api_key="sk-your-api-key"
)
```

#### 错误 2: session_id is required

**原因**: MCP 调用缺少 session_id

**解决方案**:

```python
# 使用自动生成的 session_id
mcp.call_tool("tool_name", {"input_value": "Hello"})
# 或者手动指定
mcp.call_tool_with_session("tool_name", "Hello", session_id="custom-session-id")
```

#### 错误 3: 404 Not Found - Flow not found

**原因**: 使用名称查找 Flow 失败

**解决方案**:

```python
# 1. 先列出所有 Flows 确认存在
flows = client.list_flows()
for f in flows:
    print(f["name"], f["id"])

# 2. 使用正确的 Flow ID
result = client.execute_flow(flow_id="correct-uuid", input_value="Hello")

# 3. 或使用智能执行方法
result = client.execute("My Chat Bot", "Hello")  # 自动尝试多种方式
```

#### 错误 4: 401 Unauthorized

**原因**: Token 过期或无效

**解决方案**:

```python
# 重新登录
client.login("langflow", "langflow")

# 或使用 API Key
client.api_key = "sk-new-api-key"
```

### 备用执行策略

当主方法失败时，使用智能执行方法：

```python
def safe_execute(client, flow_identifier, input_value):
    """安全的 Flow 执行方法，自动尝试多种方式"""
    methods = [
        # 方法 1: REST API 直接执行
        lambda: client.execute_flow(flow_identifier, input_value),
        # 方法 2: 通过名称执行
        lambda: client.execute_flow_by_name(flow_identifier, input_value),
        # 方法 3: MCP 执行
        lambda: client.execute_via_mcp(flow_identifier, {"input_value": input_value}),
        # 方法 4: 智能执行
        lambda: client.execute(flow_identifier, input_value),
    ]

    errors = []
    for i, method in enumerate(methods):
        try:
            return method()
        except Exception as e:
            errors.append(f"Method {i+1}: {str(e)}")
            continue

    raise RuntimeError(f"All methods failed:\n" + "\n".join(errors))
```

## 使用流程示例

### 场景：创建并执行知识库问答机器人

```python
from langflow_client import LangflowClient
from flow_builder import FlowBuilder

# 1. 初始化客户端（使用 API Key）
client = LangflowClient(
    base_url="http://localhost:7860",
    api_key="sk-your-api-key"
)

# 2. 列出可用组件
components = client.list_components(search="retriever")

# 3. 创建 Flow
builder = FlowBuilder()
builder.add_node("ChatInput", {"x": 100, "y": 200})
builder.add_node("VectorStoreRetriever", {"x": 300, "y": 200})
builder.add_node("OpenAIChatModel", {"x": 500, "y": 200})
builder.add_node("ChatOutput", {"x": 700, "y": 200})

# 连接节点
builder.connect("ChatInput", "VectorStoreRetriever", "text", "query")
builder.connect("VectorStoreRetriever", "OpenAIChatModel", "text", "input_value")
builder.connect("OpenAIChatModel", "ChatOutput", "text", "input_value")

flow = client.create_flow(
    name="RAG Bot",
    description="Knowledge base QA bot",
    data=builder.build()
)

# 4. 启用 MCP
client.enable_mcp(
    flow_id=flow["id"],
    endpoint_name="rag_bot",
    action_description="Knowledge base question answering"
)

# 5. 执行测试
result = client.execute_flow(
    flow_id=flow["id"],
    input_value="What is Langflow?"
)

print(result)
```

## 安全注意事项

1. **API Key 安全**: 不要在代码中硬编码 API Key，使用环境变量
2. **Token 管理**: Token 会在会话结束后失效，需要重新登录
3. **敏感信息**: 不在日志中记录敏感信息

## 客户端 API 参考

### LangflowClient

| 方法                        | 说明                     |
| --------------------------- | ------------------------ |
| `login(username, password)` | 用户名密码登录           |
| `list_components(...)`      | 获取组件列表             |
| `list_flows(...)`           | 获取 Flow 列表           |
| `create_flow(...)`          | 创建 Flow                |
| `get_flow(flow_id)`         | 获取 Flow 详情           |
| `update_flow(...)`          | 更新 Flow                |
| `delete_flow(flow_id)`      | 删除 Flow                |
| `enable_mcp(...)`           | 启用 MCP                 |
| `run_flow(...)`             | 运行 Flow (REST API)     |
| `execute_flow(...)`         | 执行 Flow（推荐）        |
| `execute_flow_by_name(...)` | 通过名称执行 Flow        |
| `execute(...)`              | 智能执行（自动选择方法） |
| `get_mcp_client()`          | 获取 MCP 客户端          |

### LangflowMCPClient

| 方法                          | 说明              |
| ----------------------------- | ----------------- |
| `list_tools()`                | 获取 MCP 工具列表 |
| `call_tool(name, args)`       | 执行 MCP 工具     |
| `call_tool_text(name, value)` | 执行并返回文本    |
| `call_tool_with_session(...)` | 使用会话执行      |
