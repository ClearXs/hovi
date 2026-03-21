"""Flow Builder - 构建 Langflow Flow 图结构

此模块提供 Flow 图结构的构建器，用于创建 Langflow Flows。
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import uuid4


class FlowBuilder:
    """Flow 图结构构建器

    用于构建 Langflow Flow 的 nodes 和 edges 结构。
    """

    def __init__(self):
        self.nodes: list[dict[str, Any]] = []
        self.edges: list[dict[str, Any]] = []
        self._node_ids: dict[str, str] = {}  # component_type -> node_id

    def add_node(
        self,
        component_type: str,
        position: Optional[dict[str, float]] = None,
        **template_values: Any,
    ) -> str:
        """添加节点

        Args:
            component_type: 组件类型（如 ChatInput, ChatOutput, LLM 等）
            position: 位置坐标，格式 {"x": float, "y": float}
            **template_values: 组件模板参数

        Returns:
            节点 ID
        """
        node_id = f"node_{uuid4().hex[:8]}"
        self._node_ids[component_type] = node_id

        node: dict[str, Any] = {
            "id": node_id,
            "type": component_type,
            "data": {
                "node": {
                    "id": component_type,
                    "name": component_type,
                    "display_name": component_type,
                    "base_classes": [],
                    "description": "",
                    "icon": component_type,
                    "output_types": [],
                    "template": self._build_template(template_values),
                }
            },
            "position": position or {"x": 0, "y": 0},
            "width": 250,
            "height": 100,
        }

        self.nodes.append(node)
        return node_id

    def _build_template(self, values: dict[str, Any]) -> dict[str, Any]:
        """构建组件模板

        Args:
            values: 模板值

        Returns:
            模板字典
        """
        template: dict[str, Any] = {"name": {"value": ""}}
        for key, value in values.items():
            if isinstance(value, dict) and "value" in value:
                template[key] = value
            else:
                template[key] = {"value": value}
        return template

    def add_edge(
        self,
        source: str,
        target: str,
        source_handle: Optional[str] = None,
        target_handle: Optional[str] = None,
    ) -> str:
        """添加边（连接）

        Args:
            source: 源节点 ID
            target: 目标节点 ID
            source_handle: 源 Handle（输出端口）
            target_handle: 目标 Handle（输入端口）

        Returns:
            边 ID
        """
        edge_id = f"edge_{uuid4().hex[:8]}"

        edge: dict[str, Any] = {
            "id": edge_id,
            "source": source,
            "target": target,
        }

        if source_handle:
            edge["sourceHandle"] = source_handle
        if target_handle:
            edge["targetHandle"] = target_handle

        self.edges.append(edge)
        return edge_id

    def get_node_id(self, component_type: str) -> Optional[str]:
        """获取指定组件类型的节点 ID

        Args:
            component_type: 组件类型

        Returns:
            节点 ID，如果不存在返回 None
        """
        return self._node_ids.get(component_type)

    def connect(
        self,
        source: str,
        target: str,
        source_handle: Optional[str] = None,
        target_handle: Optional[str] = None,
    ) -> str:
        """连接两个节点（使用组件类型名称）

        Args:
            source: 源组件类型名称
            target: 目标组件类型名称
            source_handle: 源 Handle
            target_handle: 目标 Handle

        Returns:
            边 ID
        """
        source_id = self.get_node_id(source)
        target_id = self.get_node_id(target)

        if not source_id:
            raise ValueError(f"Source component '{source}' not found. Add it first with add_node()")
        if not target_id:
            raise ValueError(f"Target component '{target}' not found. Add it first with add_node()")

        return self.add_edge(source_id, target_id, source_handle, target_handle)

    def build(self) -> dict[str, Any]:
        """构建 Flow 数据

        Returns:
            Flow 图数据字典
        """
        return {
            "nodes": self.nodes,
            "edges": self.edges,
        }

    def clear(self) -> None:
        """清空所有节点和边"""
        self.nodes = []
        self.edges = []
        self._node_ids = {}

    # ==================== 预设模板 ====================

    @staticmethod
    def create_simple_chat_flow(
        input_value: str = "",
        sender: str = "Machine",
        sender_name: str = "AI",
    ) -> dict[str, Any]:
        """创建简单的聊天 Flow

        包含：ChatInput -> ChatOutput

        Args:
            input_value: 默认输入值
            sender: 发送者类型
            sender_name: 发送者名称

        Returns:
            Flow 图数据
        """
        builder = FlowBuilder()

        # 添加节点
        chat_input = builder.add_node(
            "ChatInput",
            {"x": 100, "y": 100},
            input_value={"value": input_value},
            sender={"value": sender},
            sender_name={"value": sender_name},
            session_id={"value": ""},
        )

        chat_output = builder.add_node(
            "ChatOutput",
            {"x": 500, "y": 100},
        )

        # 添加边
        builder.add_edge(chat_input, chat_output, "message", "input_value")

        return builder.build()

    @staticmethod
    def create_llm_chat_flow(
        llm_type: str = "OpenAI",
        model_name: str = "gpt-4",
        api_key: str = "",
        input_value: str = "",
    ) -> dict[str, Any]:
        """创建 LLM 聊天 Flow

        包含：ChatInput -> LLM -> ChatOutput

        Args:
            llm_type: LLM 类型
            model_name: 模型名称
            api_key: API 密钥
            input_value: 默认输入值

        Returns:
            Flow 图数据
        """
        builder = FlowBuilder()

        # 添加节点
        chat_input = builder.add_node(
            "ChatInput",
            {"x": 100, "y": 100},
            input_value={"value": input_value},
        )

        # 根据 LLM 类型选择不同的节点
        llm_node_type = f"{llm_type}ChatModel"
        llm = builder.add_node(
            llm_node_type,
            {"x": 300, "y": 100},
            model_name={"value": model_name},
            api_key={"value": api_key},
        )

        chat_output = builder.add_node(
            "ChatOutput",
            {"x": 500, "y": 100},
        )

        # 添加边
        builder.add_edge(chat_input, llm, "message", "input_value")
        builder.add_edge(llm, chat_output, "text", "input_value")

        return builder.build()

    @staticmethod
    def create_rag_flow(
        llm_type: str = "OpenAI",
        model_name: str = "gpt-4",
        api_key: str = "",
    ) -> dict[str, Any]:
        """创建 RAG (检索增强生成) Flow

        包含：ChatInput -> RAG -> LLM -> ChatOutput

        Args:
            llm_type: LLM 类型
            model_name: 模型名称
            api_key: API 密钥

        Returns:
            Flow 图数据
        """
        builder = FlowBuilder()

        # 添加节点
        chat_input = builder.add_node(
            "ChatInput",
            {"x": 100, "y": 200},
        )

        # RAG 组件 (使用 Retriever)
        # 注意：实际使用时需要配置知识库
        retriever = builder.add_node(
            "RecursiveCharacterTextSplitter",
            {"x": 250, "y": 200},
        )

        llm = builder.add_node(
            f"{llm_type}ChatModel",
            {"x": 400, "y": 200},
            model_name={"value": model_name},
            api_key={"value": api_key},
        )

        chat_output = builder.add_node(
            "ChatOutput",
            {"x": 600, "y": 200},
        )

        # 添加边
        builder.add_edge(chat_input, retriever, "text", "input_value")
        builder.add_edge(retriever, llm, "documents", "input_value")
        builder.add_edge(llm, chat_output, "text", "input_value")

        return builder.build()

    @staticmethod
    def create_agent_flow(
        agent_type: str = "OpenAI",
        model_name: str = "gpt-4",
        api_key: str = "",
    ) -> dict[str, Any]:
        """创建 Agent Flow

        包含：ChatInput -> Agent -> ChatOutput

        Args:
            agent_type: Agent 类型
            model_name: 模型名称
            api_key: API 密钥

        Returns:
            Flow 图数据
        """
        builder = FlowBuilder()

        # 添加节点
        chat_input = builder.add_node(
            "ChatInput",
            {"x": 100, "y": 100},
        )

        # Agent 组件
        agent = builder.add_node(
            f"{agent_type}Agent",
            {"x": 300, "y": 100},
            model_name={"value": model_name},
            api_key={"value": api_key},
        )

        chat_output = builder.add_node(
            "ChatOutput",
            {"x": 500, "y": 100},
        )

        # 添加边
        builder.add_edge(chat_input, agent, "message", "input_value")
        builder.add_edge(agent, chat_output, "agent_scratchpad", "input_value")

        return builder.build()


class FlowTemplate:
    """Flow 模板工厂

    提供常用 Flow 模板的快速创建方法。
    """

    # 模板注册表
    TEMPLATES: dict[str, dict[str, Any]] = {
        "simple_chat": {
            "name": "Simple Chat",
            "description": "最简单的聊天流程，包含输入和输出",
            "category": "basic",
        },
        "llm_chat": {
            "name": "LLM Chat",
            "description": "基础 LLM 对话流程",
            "category": "llm",
        },
        "rag": {
            "name": "RAG",
            "description": "检索增强生成流程",
            "category": "knowledge",
        },
        "agent": {
            "name": "Agent",
            "description": "AI Agent 流程",
            "category": "agent",
        },
    }

    @classmethod
    def get_template(cls, name: str) -> Optional[dict[str, Any]]:
        """获取模板定义

        Args:
            name: 模板名称

        Returns:
            模板定义，如果不存在返回 None
        """
        return cls.TEMPLATES.get(name)

    @classmethod
    def list_templates(cls) -> list[dict[str, Any]]:
        """列出所有可用模板

        Returns:
            模板列表
        """
        return [
            {"name": name, **definition}
            for name, definition in cls.TEMPLATES.items()
        ]

    @classmethod
    def create_from_template(
        cls,
        name: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """从模板创建 Flow

        Args:
            name: 模板名称
            **kwargs: 模板参数

        Returns:
            Flow 图数据

        Raises:
            ValueError: 模板不存在时抛出
        """
        template = cls.get_template(name)
        if not template:
            available = ", ".join(cls.TEMPLATES.keys())
            raise ValueError(f"Template '{name}' not found. Available: {available}")

        category = template.get("category")

        if category == "basic" or name == "simple_chat":
            return FlowBuilder.create_simple_chat_flow(**kwargs)
        elif category == "llm" or name == "llm_chat":
            return FlowBuilder.create_llm_chat_flow(**kwargs)
        elif category == "knowledge" or name == "rag":
            return FlowBuilder.create_rag_flow(**kwargs)
        elif category == "agent" or name == "agent":
            return FlowBuilder.create_agent_flow(**kwargs)
        else:
            raise ValueError(f"Unknown template category: {category}")
