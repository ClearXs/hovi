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
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  getKnowledgeGraphStats,
  buildKnowledgeGraph,
  buildAllKnowledgeGraphs,
  getKnowledgeGraphStatus,
  clearKnowledgeGraph,
  getKnowledgeGraphData,
  type KnowledgeGraphStats,
  type KnowledgeGraphBuildTask,
  type KnowledgeGraphData,
} from "@/services/knowledgeApi";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

// 实体类型颜色映射
const TYPE_COLORS: Record<string, string> = {
  人物: "#6366F1",
  person: "#6366F1",
  组织: "#10B981",
  organization: "#10B981",
  地点: "#F59E0B",
  location: "#F59E0B",
  事件: "#EF4444",
  event: "#EF4444",
  概念: "#3B82F6",
  concept: "#3B82F6",
  产品: "#EC4899",
  product: "#EC4899",
  技术: "#14B8A6",
  technology: "#14B8A6",
  方法: "#8B5CF6",
  method: "#8B5CF6",
  数据: "#06B6D4",
  data: "#06B6D4",
  文档: "#F97316",
  document: "#F97316",
  其他: "#6B7280",
  other: "#6B7280",
};

const AUTO_COLORS = [
  "#8B5CF6",
  "#F97316",
  "#06B6D4",
  "#84CC16",
  "#F43F5E",
  "#0EA5E9",
  "#A855F7",
  "#22C55E",
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

export function KnowledgeGraphTab() {
  const { activeKbId, kbDetail } = useKnowledgeBaseStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  const [stats, setStats] = useState<KnowledgeGraphStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildTask, setBuildTask] = useState<KnowledgeGraphBuildTask | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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

    const graph = new Graph({
      container: containerRef.current,
      width,
      height,
      autoFit: "view",
      padding: 20,
      behaviors: ["drag-canvas", "zoom-canvas", "drag-node", "click-select"],
      layout: {
        type: "force",
        preventOverlap: true,
        nodeSpacing: 30,
        linkDistance: 100,
        nodeStrength: -30,
        edgeStrength: 0.1,
      },
      node: {
        style: {
          lineWidth: 2,
          fill: "#e0e7ff",
          stroke: "#6366F1",
        },
      },
      edge: {
        style: {
          stroke: "#94A3B8",
          lineWidth: 1.5,
          endArrow: true,
        },
      },
    });

    graphRef.current = graph;
  }, []);

  // 加载图谱数据并渲染
  const loadGraphData = useCallback(async () => {
    if (!activeKbId || !graphRef.current) return;

    setLoading(true);
    try {
      // 从API获取真实图谱数据
      const graphData: KnowledgeGraphData = await getKnowledgeGraphData({
        kbId: activeKbId,
        limit: 500,
      });

      const data = {
        nodes: graphData.nodes.map((n) => ({
          id: n.id,
          label: n.name,
          type: n.type || "其他",
          description: n.description,
          style: {
            fill: getOrCreateTypeColor(n.type || "其他"),
            stroke: getOrCreateTypeColor(n.type || "其他"),
          },
        })),
        edges: graphData.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.keywords?.[0] || "",
        })),
      };

      graphRef.current.setData(data);
      graphRef.current.render();
    } catch (err) {
      console.error("Failed to load graph data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeKbId]);

  // 初始加载
  useEffect(() => {
    if (activeKbId) {
      loadStats();
      initGraph();
    }
  }, [activeKbId, loadStats, initGraph]);

  // 加载图谱数据
  useEffect(() => {
    if (activeKbId) {
      loadGraphData();
    }
  }, [activeKbId, loadGraphData]);

  // 清理
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, []);

  // 重新构建图谱（构建KB中所有文档）
  const handleRebuild = async () => {
    if (!activeKbId) return;

    setBuilding(true);
    setError(null);
    try {
      // 调用批量构建API
      const result = await buildAllKnowledgeGraphs({ kbId: activeKbId });

      // 创建一个虚拟任务来显示进度
      const taskId = result.taskIds[0];
      if (taskId) {
        // 轮询任务状态
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

  // 导出功能 - 简化版本
  const handleExport = async (type: "json" | "png" | "svg") => {
    if (!graphRef.current) return;

    // 获取当前图数据用于JSON导出 - 从stats中获取
    const jsonData = {
      stats,
      exportTime: new Date().toISOString(),
    };

    if (type === "json") {
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-graph-${kbDetail?.name || "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      console.warn(`${type} export not fully supported, please use JSON export`);
    }
  };

  // 筛选节点 - 简化版本
  const handleFilter = () => {
    // 简化处理
  };

  // 搜索节点 - 简化版本
  const handleSearch = () => {
    // 简化处理
  };

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
      <div className="flex items-center justify-between p-4 border-b border-border-light">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRebuild}
            disabled={building}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {building ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            重新构建
          </button>

          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-gray-50">
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
              <button
                onClick={() => handleExport("svg")}
                className="flex w-full px-3 py-1.5 text-sm text-text-primary hover:bg-gray-100"
              >
                导出 SVG
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="搜索实体..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-48 px-3 py-1.5 text-sm border border-border rounded-md"
          />
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
        {/* 左侧统计面板 */}
        <div className="w-64 border-r border-border-light p-4 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : stats ? (
            <div className="space-y-4">
              {/* 实体/关系总数 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-primary/5 rounded-lg text-center">
                  <div className="text-2xl font-semibold text-primary">{stats.totalEntities}</div>
                  <div className="text-xs text-text-secondary">实体总数</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <div className="text-2xl font-semibold text-green-600">
                    {stats.totalRelations}
                  </div>
                  <div className="text-xs text-text-secondary">关系总数</div>
                </div>
              </div>

              {/* 类型分布 */}
              <div>
                <h3 className="text-sm font-medium mb-2">类型分布</h3>
                <div className="space-y-1">
                  {Object.entries(stats.entityTypes).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: getOrCreateTypeColor(type) }}
                        />
                        <span>{type}</span>
                      </div>
                      <span className="text-text-secondary">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 高频关系词 */}
              {stats.topKeywords.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">高频关系词</h3>
                  <div className="flex flex-wrap gap-1">
                    {stats.topKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-text-tertiary">暂无图谱数据</div>
          )}
        </div>

        {/* 右侧图谱可视化 */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />

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
        </div>
      </div>
    </div>
  );
}
