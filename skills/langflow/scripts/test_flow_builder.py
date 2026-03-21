"""Flow Builder Tests"""

import pytest

from flow_builder import FlowBuilder, FlowTemplate


class TestFlowBuilder:
    """FlowBuilder 单元测试"""

    def test_init(self):
        """测试初始化"""
        builder = FlowBuilder()
        assert builder.nodes == []
        assert builder.edges == []

    def test_add_node(self):
        """测试添加节点"""
        builder = FlowBuilder()
        node_id = builder.add_node("ChatInput", {"x": 100, "y": 200})

        assert node_id is not None
        assert len(builder.nodes) == 1
        assert builder.nodes[0]["type"] == "ChatInput"
        assert builder.nodes[0]["position"] == {"x": 100, "y": 200}

    def test_add_node_default_position(self):
        """测试添加节点使用默认位置"""
        builder = FlowBuilder()
        node_id = builder.add_node("ChatOutput")

        assert node_id is not None
        assert builder.nodes[0]["position"] == {"x": 0, "y": 0}

    def test_add_node_with_template_values(self):
        """测试添加节点并设置模板值"""
        builder = FlowBuilder()
        builder.add_node(
            "ChatInput",
            {"x": 100, "y": 200},
            input_value={"value": "Hello"},
            sender={"value": "User"},
        )

        template = builder.nodes[0]["data"]["node"]["template"]
        assert "input_value" in template
        assert template["input_value"]["value"] == "Hello"

    def test_add_edge(self):
        """测试添加边"""
        builder = FlowBuilder()
        node1 = builder.add_node("ChatInput", {"x": 100, "y": 100})
        node2 = builder.add_node("ChatOutput", {"x": 500, "y": 100})

        edge_id = builder.add_edge(node1, node2, "message", "input_value")

        assert edge_id is not None
        assert len(builder.edges) == 1
        assert builder.edges[0]["source"] == node1
        assert builder.edges[0]["target"] == node2

    def test_add_edge_without_handles(self):
        """测试添加边不指定 handle"""
        builder = FlowBuilder()
        node1 = builder.add_node("ChatInput", {"x": 100, "y": 100})
        node2 = builder.add_node("ChatOutput", {"x": 500, "y": 100})

        edge_id = builder.add_edge(node1, node2)

        assert edge_id is not None
        assert "sourceHandle" not in builder.edges[0]

    def test_get_node_id(self):
        """测试获取节点 ID"""
        builder = FlowBuilder()
        builder.add_node("ChatInput", {"x": 100, "y": 100})

        node_id = builder.get_node_id("ChatInput")
        assert node_id is not None

    def test_get_node_id_not_found(self):
        """测试获取不存在的节点 ID"""
        builder = FlowBuilder()

        node_id = builder.get_node_id("NonExistent")
        assert node_id is None

    def test_connect(self):
        """测试使用组件类型名连接"""
        builder = FlowBuilder()
        builder.add_node("ChatInput", {"x": 100, "y": 100})
        builder.add_node("ChatOutput", {"x": 500, "y": 100})

        edge_id = builder.connect("ChatInput", "ChatOutput", "message", "input_value")

        assert edge_id is not None

    def test_connect_source_not_found(self):
        """测试连接不存在的源节点"""
        builder = FlowBuilder()
        builder.add_node("ChatOutput", {"x": 500, "y": 100})

        with pytest.raises(ValueError, match="Source component"):
            builder.connect("NonExistent", "ChatOutput")

    def test_build(self):
        """测试构建 Flow 数据"""
        builder = FlowBuilder()
        builder.add_node("ChatInput", {"x": 100, "y": 100})
        builder.add_node("ChatOutput", {"x": 500, "y": 100})
        builder.connect("ChatInput", "ChatOutput", "message", "input_value")

        data = builder.build()

        assert "nodes" in data
        assert "edges" in data
        assert len(data["nodes"]) == 2
        assert len(data["edges"]) == 1

    def test_clear(self):
        """测试清空"""
        builder = FlowBuilder()
        builder.add_node("ChatInput", {"x": 100, "y": 100})
        builder.add_node("ChatOutput", {"x": 500, "y": 100})
        builder.connect("ChatInput", "ChatOutput")

        builder.clear()

        assert builder.nodes == []
        assert builder.edges == []

    def test_create_simple_chat_flow(self):
        """测试创建简单聊天 Flow"""
        data = FlowBuilder.create_simple_chat_flow()

        assert len(data["nodes"]) == 2
        assert len(data["edges"]) == 1

        # 验证节点类型
        node_types = [n["type"] for n in data["nodes"]]
        assert "ChatInput" in node_types
        assert "ChatOutput" in node_types

    def test_create_simple_chat_flow_with_params(self):
        """测试带参数的简单聊天 Flow"""
        data = FlowBuilder.create_simple_chat_flow(
            input_value="Hello",
            sender="User",
            sender_name="User Name",
        )

        chat_input = next(n for n in data["nodes"] if n["type"] == "ChatInput")
        template = chat_input["data"]["node"]["template"]

        assert template["input_value"]["value"] == "Hello"
        assert template["sender"]["value"] == "User"

    def test_create_llm_chat_flow(self):
        """测试创建 LLM 聊天 Flow"""
        data = FlowBuilder.create_llm_chat_flow(
            llm_type="OpenAI",
            model_name="gpt-4",
        )

        assert len(data["nodes"]) == 3
        assert len(data["edges"]) == 2

    def test_create_rag_flow(self):
        """测试创建 RAG Flow"""
        data = FlowBuilder.create_rag_flow()

        assert len(data["nodes"]) == 4
        assert len(data["edges"]) == 3

    def test_create_agent_flow(self):
        """测试创建 Agent Flow"""
        data = FlowBuilder.create_agent_flow()

        assert len(data["nodes"]) == 3
        assert len(data["edges"]) == 2


class TestFlowTemplate:
    """FlowTemplate 单元测试"""

    def test_get_template(self):
        """测试获取模板"""
        template = FlowTemplate.get_template("simple_chat")
        assert template is not None
        assert template["name"] == "Simple Chat"

    def test_get_template_not_found(self):
        """测试获取不存在的模板"""
        template = FlowTemplate.get_template("non_existent")
        assert template is None

    def test_list_templates(self):
        """测试列出所有模板"""
        templates = FlowTemplate.list_templates()
        assert len(templates) >= 4
        template_names = [t["name"] for t in templates]
        assert "Simple Chat" in template_names
        assert "LLM Chat" in template_names
        assert "RAG" in template_names

    def test_create_from_template_simple_chat(self):
        """测试从模板创建"""
        data = FlowTemplate.create_from_template("simple_chat")
        assert "nodes" in data

    def test_create_from_template_llm_chat(self):
        """测试从模板创建 LLM Chat"""
        data = FlowTemplate.create_from_template("llm_chat", model_name="gpt-4")
        assert "nodes" in data

    def test_create_from_template_invalid(self):
        """测试创建不存在的模板"""
        with pytest.raises(ValueError, match="Template"):
            FlowTemplate.create_from_template("non_existent_template")

    def test_template_categories(self):
        """测试模板分类"""
        template = FlowTemplate.get_template("rag")
        assert template["category"] == "knowledge"

        template = FlowTemplate.get_template("agent")
        assert template["category"] == "agent"
