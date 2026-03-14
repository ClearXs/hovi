"use client";

import { Graph } from "@antv/g6";
import {
  RefreshCw,
  Download,
  Search,
  Filter,
  BookOpen,
  Network,
  Link2,
  AlertCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  getKnowledgeGraphStats,
  buildKnowledgeGraph,
  buildAllKnowledgeGraphs,
  getKnowledgeGraphStatus,
  clearKnowledgeGraph,
  getKnowledgeGraphData,
  getEntityDetails,
  type KnowledgeGraphStats,
  type KnowledgeGraphBuildTask,
  type KnowledgeGraphData,
  type EntityDetails,
} from "@/services/knowledgeApi";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

// 实体类型颜色映射
const TYPE_COLORS: Record<string, string> = {
  人物: "#E11D48",
  person: "#E11D48",
  组织: "#059669",
  organization: "#059669",
  地点: "#D97706",
  location: "#D97706",
  事件: "#DC2626",
  event: "#DC2626",
  概念: "#2563EB",
  concept: "#2563EB",
  产品: "#DB2777",
  product: "#DB2777",
  技术: "#0D9488",
  technology: "#0D9488",
  方法: "#7C3AED",
  method: "#7C3AED",
  数据: "#0891B2",
  data: "#0891B2",
  文档: "#EA580C",
  document: "#EA580C",
  其他: "#6B7280",
  other: "#6B7280",
};

const AUTO_COLORS = [
  "#E11D48",
  "#059669",
  "#D97706",
  "#DC2626",
  "#2563EB",
  "#DB2777",
  "#0D9488",
  "#7C3AED",
  "#0891B2",
  "#EA580C",
  "#6366F1",
  "#EC4899",
];

function getTypeColor(type: string | null | undefined): string {
  if (!type) return TYPE_COLORS["其他"];
  return TYPE_COLORS[type] || TYPE_COLORS["其他"];
}

// 获取颜色映射（带缓存）
const colorCache = new Map<string, string>();
let colorIndex = 0;

function getOrCreateTypeColor(type: string): string {
  if (colorCache.has(type)) {
    return colorCache.get(type)!;
  }
  if (TYPE_COLORS[type]) {
    colorCache.set(type, TYPE_COLORS[type]);
    return TYPE_COLORS[type];
  }
  // 为未知类型分配新颜色
  const color = AUTO_COLORS[colorIndex % AUTO_COLORS.length];
  colorIndex++;
  colorCache.set(type, color);
  return color;
}

interface NodeData {
  id: string;
  label: string;
  type: string;
  description?: string | null;
  degree?: number;
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  keywords: string[];
}

export function KnowledgeGraphTab() {
  const { activeKbId, kbDetail } = useKnowledgeBaseStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const minimapRef = useRef<HTMLDivElement>(null);

  // 邻居缓存 - 用于悬停高亮
  const neighborCacheRef = useRef<{
    nodeNeighbors: Map<string, Set<string>>;
    edgeNeighbors: Map<string, Set<string>>;
  }>({
    nodeNeighbors: new Map(),
    edgeNeighbors: new Map(),
  });

  const [stats, setStats] = useState<KnowledgeGraphStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildTask, setBuildTask] = useState<KnowledgeGraphBuildTask | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 详情面板状态
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [entityChunks, setEntityChunks] = useState<EntityDetails["chunks"]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // 图例折叠状态
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // 节点/边的度数计算（用于调整大小）
  const [nodeDegrees, setNodeDegrees] = useState<Map<string, number>>(new Map());

  // 加载图谱统计
  const loadStats = useCallback(async () => {
    if (!activeKbId) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getKnowledgeGraphStats({ kbId: activeKbId });
      setStats(data);
    } catch (err) {
      console.error("Failed to load graph stats:", err);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [activeKbId]);

  // 计算节点度数
  const calculateDegrees = useCallback((edges: EdgeData[]) => {
    const degrees = new Map<string, number>();
    edges.forEach((edge) => {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });
    return degrees;
  }, []);

  // 初始化 G6 图谱
  const initGraph = useCallback(() => {
    if (!containerRef.current) return;

    // 如果已有图谱，先销毁
    if (graphRef.current) {
      graphRef.current.destroy();
      graphRef.current = null;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 500;

    let graph;
    try {
      graph = new Graph({
        container: containerRef.current,
        width,
        height,
        autoFit: "view",
        padding: 40,
        // 交互行为 - G6 5.x 内置 behaviors
        behaviors: ["drag-canvas", "zoom-canvas", "click-select"],
        // 布局 - 使用 d3-force，增加间距
        layout: {
          type: "d3-force",
          preventOverlap: true,
          nodeSpacing: 60,
          alphaDecay: 0.1,
          alphaMin: 0.01,
          velocityDecay: 0.6,
          iterations: 200,
          force: {
            center: { x: 0.5, y: 0.5, strength: 0.05 },
            charge: { strength: -600, distanceMax: 800 },
            link: { distance: 150, strength: 0.6 },
          },
          collide: { radius: 50, strength: 0.8, iterations: 3 },
        },
        // 默认节点配置
        node: {
          type: "circle",
        },
        // 默认边配置
        edge: {
          type: "quadratic",
        },
      });
    } catch (error) {
      console.error("Failed to create graph:", error);
      return;
    }

    // 确保 graph 成功创建
    if (!graph) {
      console.error("Failed to create graph");
      return;
    }

    // 事件处理 - G6 5.x
    graph.on("node:click", async (evt: any) => {
      try {
        // G6 5.x: 使用 evt.item, evt.target 或 evt.originalTarget
        const item = evt.item || evt.target || evt.originalTarget;
        if (!item) {
          console.warn("No item in click event");
          return;
        }
        // 使用 getModel() 获取数据
        const model = typeof item.getModel === "function" ? item.getModel() : item;
        if (!model) {
          console.warn("No model in click event");
          return;
        }

        // G6 5.x: 数据在 model 中，可能是 data 属性或直接在 model 上
        const data = model.data || {};
        const fullLabel =
          data.fullLabel || model.label || model.id?.split(":").slice(2).join(":") || "未知";
        const nodeType = data.type || model.type || "其他";

        setSelectedNode({
          id: model.id,
          label: fullLabel,
          type: nodeType,
          description: data.description || model.description || null,
          degree: nodeDegrees.get(model.id) || 0,
        });
        setDetailPanelOpen(true);

        // 加载关联文档
        if (activeKbId && model.id) {
          setLoadingChunks(true);
          setEntityChunks([]);
          try {
            const details = await getEntityDetails({
              kbId: activeKbId,
              entityId: model.id,
            });
            setEntityChunks(details.chunks || []);
          } catch (err) {
            console.error("Failed to load entity details:", err);
          } finally {
            setLoadingChunks(false);
          }
        }
      } catch (err) {
        console.error("Error handling node click:", err);
      }
    });

    // 点击边显示详情 - G6 5.x 使用 "click" 事件
    graph.on("click", (evt: any) => {
      try {
        const targetType = evt.targetType;
        // G6 5.x: 使用 evt.item 或 evt.originalTarget
        const item = evt.item || evt.originalTarget;
        console.log("Click targetType:", targetType, "item:", item);

        if (!item) {
          // 点击空白处
          return;
        }

        if (targetType === "edge") {
          // 尝试从 item 获取边的数据
          console.log("Edge item entity:", item.entity);
          console.log("Edge item name:", item.name);

          // item.entity 可能包含边数据
          let model = item.entity || {};
          if (!model.id && item.name) {
            // 尝试通过 name 查找
            const graphData = graphRef.current?.getData();
            const edges = (graphData?.edges || []) as any[];
            model = edges.find((e) => e.id === item.name) || {};
          }

          console.log("Edge model:", model);

          // 获取边数据
          const data = model?.data || {};
          const label = model?.label || data?.label || model?.id?.split(":").pop() || "未知关系";
          const source = model?.source || data?.source || "未知";
          const target = model?.target || data?.target || "未知";
          const edgeId = model?.id || "";

          // 提取实体名称
          const sourceName =
            String(source).split(":").slice(2).join(":") ||
            String(source).split(":").pop() ||
            source;
          const targetName =
            String(target).split(":").slice(2).join(":") ||
            String(target).split(":").pop() ||
            target;

          console.log("Edge data:", { label, sourceName, targetName, edgeId });

          setSelectedNode({
            id: edgeId,
            label: `${sourceName} → ${targetName}`,
            type: "关系",
            description: label,
            degree: 0,
          });
          setDetailPanelOpen(true);
          setEntityChunks([]);
        }
      } catch (err) {
        console.error("Error handling click:", err);
      }
    });

    graph.on("canvas:click", () => {
      setDetailPanelOpen(false);
      setSelectedNode(null);
    });

    // 邻居高亮功能 - G6 5.x 简化版
    graph.on("node:mouseenter", (evt: any) => {
      try {
        const { item } = evt;
        if (item) {
          graph.setElementState(item, "hover", true);
        }
      } catch (e) {
        // 忽略 G6 5.x API 错误
      }
    });

    graph.on("node:mouseleave", (evt: any) => {
      try {
        const { item } = evt;
        if (item) {
          graph.setElementState(item, "hover", false);
        }
      } catch (e) {
        // 忽略 G6 5.x API 错误
      }
    });

    graphRef.current = graph;
  }, []);

  // 加载图谱数据并渲染
  const loadGraphData = useCallback(async () => {
    if (!activeKbId || !graphRef.current) return;

    setLoading(true);
    try {
      const graphData: KnowledgeGraphData = await getKnowledgeGraphData({
        kbId: activeKbId,
        limit: 10000, // 支持大规模
      });

      // 计算度数
      const degrees = calculateDegrees(graphData.edges);
      setNodeDegrees(degrees);

      // 处理节点数据 - G6 5.x 格式
      const nodes = graphData.nodes.map((n) => {
        const degree = degrees.get(n.id) || 0;
        const color = getOrCreateTypeColor(n.type || "其他");
        // 根据度数计算节点大小（最小20，最大50）
        const baseSize = 20;
        const sizeIncrement = Math.min(degree * 2, 30);
        const size = baseSize + sizeIncrement;
        // 缩短标签显示
        const labelText = n.name.length > 8 ? n.name.substring(0, 8) + ".." : n.name;

        return {
          id: n.id,
          data: {
            label: labelText,
            fullLabel: n.name,
            type: n.type || "其他",
            description: n.description,
          },
          style: {
            size: size,
            fill: color + "50",
            stroke: color,
            lineWidth: 2,
            labelText: labelText,
            labelFill: "#1F2937",
            labelFontSize: 11,
            labelFontWeight: 500,
          },
        };
      });

      // 建立节点 ID 集合 (用于边连接)
      const nodeIds = new Set(graphData.nodes.map((n) => n.id));

      // 处理边数据 - G6 5.x 格式
      const edges = graphData.edges.map((e, idx) => {
        const keywords = e.keywords || [];
        const labelText = keywords[0] || "";

        // 直接使用 source/target，如果不存在则保留原值
        const sourceId = nodeIds.has(e.source) ? e.source : e.source;
        const targetId = nodeIds.has(e.target) ? e.target : e.target;

        return {
          id: e.id,
          source: sourceId,
          target: targetId,
          data: {
            label: labelText,
            keywords,
          },
          style: {
            stroke: "#94A3B8",
            lineWidth: 1.5,
            endArrow: true,
            labelText: labelText,
            labelFill: "#475569",
            labelFontSize: 10,
          },
        };
      });

      // 填充邻居缓存
      const nodeNeighbors = new Map<string, Set<string>>();
      const edgeNeighbors = new Map<string, Set<string>>();
      for (const edge of graphData.edges) {
        if (!nodeNeighbors.has(edge.source)) nodeNeighbors.set(edge.source, new Set());
        nodeNeighbors.get(edge.source)!.add(edge.target);

        if (!nodeNeighbors.has(edge.target)) nodeNeighbors.set(edge.target, new Set());
        nodeNeighbors.get(edge.target)!.add(edge.source);

        if (!edgeNeighbors.has(edge.source)) edgeNeighbors.set(edge.source, new Set());
        edgeNeighbors.get(edge.source)!.add(edge.id);

        if (!edgeNeighbors.has(edge.target)) edgeNeighbors.set(edge.target, new Set());
        edgeNeighbors.get(edge.target)!.add(edge.id);
      }
      neighborCacheRef.current = { nodeNeighbors, edgeNeighbors };

      // 调试日志
      console.log("Loading graph data:", { nodesCount: nodes.length, edgesCount: edges.length });
      console.log("Sample nodes:", nodes.slice(0, 3));
      console.log("Sample edges:", edges.slice(0, 3));
      console.log(
        "Node IDs sample:",
        nodes.slice(0, 5).map((n) => n.id),
      );
      console.log(
        "Edge source/target sample:",
        edges.slice(0, 5).map((e) => ({ source: e.source, target: e.target })),
      );

      graphRef.current.setData({ nodes, edges });
      graphRef.current.render();
      graphRef.current.fitView();
    } catch (err) {
      console.error("Failed to load graph data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeKbId, calculateDegrees]);

  // 搜索并定位节点
  const handleSearch = useCallback(() => {
    if (!graphRef.current || !searchKeyword.trim()) return;

    const graph = graphRef.current;
    const keyword = searchKeyword.toLowerCase();

    // 查找匹配的节点 - G6 5.x 简化版
    const data = graph.getData();
    const nodes = data.nodes || [];
    let foundNode = null;

    for (const node of nodes) {
      if (
        (node.label as string)?.toLowerCase().includes(keyword) ||
        (node.fullLabel as string)?.toLowerCase().includes(keyword) ||
        (node.type as string)?.toLowerCase().includes(keyword)
      ) {
        foundNode = node;
        break;
      }
    }

    if (foundNode) {
      // 选中并定位到节点
      graph.focusElement(foundNode.id as string, true);

      // 显示详情
      setSelectedNode({
        id: foundNode.id as string,
        label: (foundNode.fullLabel as string) || (foundNode.label as string),
        type: foundNode.type as string,
        description: foundNode.description as string,
        degree: nodeDegrees.get(foundNode.id as string) || 0,
      });
      setDetailPanelOpen(true);
    }
  }, [searchKeyword, nodeDegrees]);

  // 缩放控制 - G6 5.x 简化版
  const handleZoomIn = () => {
    // 暂不支持
    console.log("Zoom in not supported in G6 5.x");
  };
  const handleZoomOut = () => {
    // 暂不支持
    console.log("Zoom out not supported in G6 5.x");
  };
  const handleFitView = () => graphRef.current?.fitView();

  // 初始加载
  useEffect(() => {
    if (activeKbId) {
      loadStats();
    }
  }, [activeKbId, loadStats]);

  // 初始化图谱（延迟以等待容器尺寸）
  useEffect(() => {
    if (activeKbId && containerRef.current) {
      // 延迟初始化确保容器已渲染
      const timer = setTimeout(() => {
        initGraph();
        loadGraphData();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeKbId, initGraph, loadGraphData]);

  // 窗口大小变化时调整画布
  useEffect(() => {
    if (!containerRef.current || !graphRef.current) return;

    const handleResize = () => {
      const width = containerRef.current?.clientWidth || 500;
      const height = containerRef.current?.clientHeight || 500;
      graphRef.current?.setSize(width, height);
      graphRef.current?.fitView();
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, []);

  // 重新构建图谱
  const handleRebuild = async () => {
    if (!activeKbId) return;

    setBuilding(true);
    setError(null);
    try {
      const result = await buildAllKnowledgeGraphs({ kbId: activeKbId });
      const taskId = result.taskIds[0];

      if (taskId) {
        const pollInterval = setInterval(async () => {
          try {
            const taskStatus = await getKnowledgeGraphStatus({ taskId });
            setBuildTask(taskStatus);

            if (taskStatus.status === "success" || taskStatus.status === "failed") {
              clearInterval(pollInterval);
              setBuilding(false);
              loadStats();
              loadGraphData();
            }
          } catch (err) {
            console.error("Failed to poll task status:", err);
          }
        }, 2000);
      } else {
        setBuilding(false);
        if (result.documentCount === 0) {
          setError("知识库中没有文档");
        } else {
          loadStats();
          loadGraphData();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "构建失败");
      setBuilding(false);
    }
  };

  // 导出功能
  const handleExport = async (type: "json" | "png") => {
    if (!graphRef.current) return;

    if (type === "json") {
      const data = graphRef.current.getData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-graph-${kbDetail?.name || "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (type === "png") {
      // PNG export not supported in G6 5.x
      console.warn("PNG export not supported");
    }
  };

  // 切换类型筛选
  const toggleTypeFilter = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  // 类型列表
  const typeList = useMemo(() => {
    if (!stats?.entityTypes) return [];
    return Object.entries(stats.entityTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [stats?.entityTypes]);

  if (!activeKbId) {
    return (
      <div className="rounded-xl border border-border-light p-lg text-sm text-text-tertiary">
        请先选择一个知识库
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between p-3 border-b border-border-light bg-white">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRebuild}
            disabled={building}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {building ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            重新构建
          </button>

          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              导出
            </button>
            <div className="absolute top-full left-0 mt-1 py-1 bg-white border border-border rounded-md shadow-lg hidden group-hover:block z-10">
              <button
                onClick={() => handleExport("json")}
                className="flex w-full px-3 py-1.5 text-sm text-text-primary hover:bg-gray-100"
              >
                导出 JSON
              </button>
              <button
                onClick={() => handleExport("png")}
                className="flex w-full px-3 py-1.5 text-sm text-text-primary hover:bg-gray-100"
              >
                导出 PNG
              </button>
            </div>
          </div>

          {/* 缩放控制 */}
          <div className="flex items-center gap-1 border-l border-border-light pl-2 ml-1">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitView}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded"
              title="适应画布"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="搜索实体..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-48 pl-8 pr-3 py-1.5 text-sm border border-border rounded-md focus:border-primary/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 构建进度 */}
      {buildTask && buildTask.status === "running" && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm text-blue-700">正在构建图谱... {buildTask.progress}%</span>
          </div>
          <div className="w-full h-1 mt-1 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${buildTask.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧面板 */}
        <div className="w-56 border-r border-border-light bg-white flex flex-col overflow-hidden">
          {/* 统计信息 */}
          <div className="p-3 border-b border-border-light">
            {loading && !stats ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : stats ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-primary/5 rounded-lg text-center">
                    <div className="text-xl font-semibold text-primary">{stats.totalEntities}</div>
                    <div className="text-xs text-text-secondary">实体</div>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg text-center">
                    <div className="text-xl font-semibold text-green-600">
                      {stats.totalRelations}
                    </div>
                    <div className="text-xs text-text-secondary">关系</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* 类型筛选 */}
          <div className="p-3 border-b border-border-light">
            <button
              onClick={() => setLegendCollapsed(!legendCollapsed)}
              className="flex items-center justify-between w-full text-sm font-medium mb-2"
            >
              <span>类型筛选</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${legendCollapsed ? "-rotate-90" : ""}`}
              />
            </button>
            {!legendCollapsed && typeList.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {typeList.map(({ type, count }) => (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={`flex items-center justify-between w-full px-2 py-1 rounded text-sm transition-colors ${
                      selectedTypes.includes(type)
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-gray-50 text-text-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: getOrCreateTypeColor(type) }}
                      />
                      <span>{type}</span>
                    </div>
                    <span className="text-xs">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 关系词 */}
          {stats && stats.topKeywords.length > 0 && (
            <div className="p-3 flex-1 overflow-y-auto">
              <h3 className="text-sm font-medium mb-2">高频关系词</h3>
              <div className="flex flex-wrap gap-1">
                {stats.topKeywords.slice(0, 15).map((kw) => (
                  <span key={kw} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 空状态提示 */}
          {!loading && (!stats || stats.totalEntities === 0) && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <Network className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-text-tertiary">暂无图谱数据</p>
              </div>
            </div>
          )}
        </div>

        {/* 右侧图谱可视化 */}
        <div className="flex-1 relative overflow-hidden">
          {/* 小地图 */}
          <div
            ref={minimapRef}
            className="absolute bottom-3 right-3 z-10 border border-border-light rounded-md overflow-hidden shadow-sm bg-white"
          />

          {/* 加载遮罩 */}
          {loading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {/* 图谱容器 */}
          <div ref={containerRef} className="w-full h-full bg-gray-50/50" />

          {/* 空状态 */}
          {!loading && (!stats || stats.totalEntities === 0) && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <div className="text-center">
                <Network className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-text-secondary mb-3">暂无图谱数据</p>
                <p className="text-xs text-text-tertiary mb-4">
                  上传文档并启用图谱抽取后，将自动构建知识图谱
                </p>
                <button
                  onClick={handleRebuild}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  立即构建
                </button>
              </div>
            </div>
          )}

          {/* 详情面板 */}
          {detailPanelOpen && selectedNode && (
            <div className="absolute top-3 right-3 w-80 max-h-[80vh] bg-white rounded-lg shadow-lg border border-border-light overflow-hidden z-20 flex flex-col">
              <div className="flex items-center justify-between p-3 border-b border-border-light bg-gray-50 shrink-0">
                <span className="text-sm font-medium">实体详情</span>
                <button
                  onClick={() => {
                    setDetailPanelOpen(false);
                    setEntityChunks([]);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 space-y-2 overflow-y-auto">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getOrCreateTypeColor(selectedNode.type) }}
                  />
                  <span className="font-medium text-sm break-all">{selectedNode.label}</span>
                </div>
                <div className="text-xs text-text-secondary">
                  <span className="font-medium">类型：</span>
                  {selectedNode.type}
                </div>
                {/* 关系类型 - 只有边才显示 */}
                {selectedNode.type === "关系" && selectedNode.description && (
                  <div className="text-xs text-text-secondary">
                    <span className="font-medium">关系：</span>
                    <span className="text-primary font-medium">{selectedNode.description}</span>
                  </div>
                )}
                {selectedNode.type !== "关系" && (
                  <div className="text-xs text-text-secondary">
                    <span className="font-medium">度数：</span>
                    {selectedNode.degree} 个连接
                  </div>
                )}
                {selectedNode.description && selectedNode.type !== "关系" && (
                  <div className="text-xs text-text-secondary mt-2 pt-2 border-t border-border-light">
                    <span className="font-medium">描述：</span>
                    {selectedNode.description}
                  </div>
                )}

                {/* 关联文档 */}
                <div className="mt-3 pt-2 border-t border-border-light">
                  <div className="flex items-center gap-1 mb-2">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">关联文档</span>
                  </div>
                  {loadingChunks ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  ) : entityChunks.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {entityChunks.map((chunk, idx) => (
                        <div
                          key={chunk.id || idx}
                          className="text-xs p-2 bg-gray-50 rounded border border-border-light"
                        >
                          <div className="font-medium text-text-secondary mb-1 truncate">
                            {chunk.documentName}
                          </div>
                          <p className="text-text-tertiary line-clamp-3">{chunk.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-text-tertiary">暂无关联文档</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
