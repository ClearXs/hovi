"use client";

import { Network, Search, FileText, GitBranch, Loader2, Settings2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  knowledgeSearch,
  searchKnowledgeGraph,
  type KnowledgeGraphSearchResult,
} from "@/services/knowledgeApi";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";
import { useSessionStore } from "@/stores/sessionStore";

interface KnowledgeRetrievalTabProps {
  onOpenDocument?: (documentId: string) => void;
}

type RetrievalMode = "semantic" | "keyword" | "hybrid";
type GraphMode = "local" | "global" | "hybrid" | "naive";

/**
 * 高亮文本中的关键词
 */
function highlightText(text: string, keywords: string[]): React.ReactNode {
  if (!keywords.length || !text) return text;

  // 转义特殊正则字符
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 构建正则表达式，匹配所有关键词（不区分大小写）
  const pattern = keywords.map(escapeRegex).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");

  // 分割文本并高亮
  const parts = text.split(regex);

  return parts.map((part, i) => {
    const isMatch = keywords.some((kw) => part.toLowerCase() === kw.toLowerCase());
    if (isMatch) {
      return (
        <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
          {part}
        </mark>
      );
    }
    return part;
  });
}

interface SearchResult {
  type: "vector" | "graph_entity" | "graph_relation" | "graph_chunk";
  id: string;
  title: string;
  subtitle: string;
  content: string;
  score: number;
  documentId?: string;
  metadata?: Record<string, string>;
}

export function KnowledgeRetrievalTab({ onOpenDocument }: KnowledgeRetrievalTabProps) {
  const sessionKey = useSessionStore((state) => state.activeSessionKey);
  const activeKbId = useKnowledgeBaseStore((state) => state.activeKbId);
  const baseSettings = useKnowledgeBaseStore((state) => state.baseSettings);
  const setSearchResults = useKnowledgeBaseStore((state) => state.setSearchResults);
  const navigateToSearchResult = useKnowledgeBaseStore((state) => state.navigateToSearchResult);

  const [query, setQuery] = useState("");
  const [savedQuery, setSavedQuery] = useState(""); // 保存搜索关键词用于高亮
  const [limit, setLimit] = useState(10);
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("semantic");
  const [graphMode, setGraphMode] = useState<GraphMode>("hybrid");
  const [includeGraph, setIncludeGraph] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [graphData, setGraphData] = useState<KnowledgeGraphSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "vector" | "graph">("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 从搜索关键词计算高亮关键词
  const highlightKeywords = useMemo(() => {
    if (!savedQuery.trim()) return [];
    return savedQuery
      .trim()
      .split(/[\s,，。！？!?;；:：]+/)
      .map((kw) => kw.trim())
      .filter((kw) => kw.length > 1); // 过滤单字符
  }, [savedQuery]);

  // Local settings state for the modal
  const [localRetrievalMode, setLocalRetrievalMode] = useState<RetrievalMode>("semantic");
  const [localGraphMode, setLocalGraphMode] = useState<GraphMode>("hybrid");
  const [localIncludeGraph, setLocalIncludeGraph] = useState(true);
  const [localMinScore, setLocalMinScore] = useState(0.1);
  const [localHybridAlpha, setLocalHybridAlpha] = useState(0.7);

  useEffect(() => {
    if (baseSettings) {
      setRetrievalMode(baseSettings.retrieval.mode as RetrievalMode);
      setLocalRetrievalMode(baseSettings.retrieval.mode as RetrievalMode);
      setLocalMinScore(baseSettings.retrieval.minScore);
      setLocalHybridAlpha(baseSettings.retrieval.hybridAlpha);
    }
  }, [baseSettings]);

  const handleOpenSettings = () => {
    setLocalRetrievalMode(retrievalMode);
    setLocalGraphMode(graphMode);
    setLocalIncludeGraph(includeGraph);
    if (baseSettings) {
      setLocalMinScore(baseSettings.retrieval.minScore);
      setLocalHybridAlpha(baseSettings.retrieval.hybridAlpha);
    }
    setSettingsOpen(true);
  };

  const handleApplySettings = () => {
    setRetrievalMode(localRetrievalMode);
    setGraphMode(localGraphMode);
    setIncludeGraph(localIncludeGraph);
    setSettingsOpen(false);
  };

  const effectiveLimit = baseSettings
    ? Math.max(1, Math.min(limit, baseSettings.retrieval.topK))
    : limit;

  if (!activeKbId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
        请先选择知识库
      </div>
    );
  }

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("请输入检索关键词");
      return;
    }
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setSavedQuery(trimmed); // 保存搜索关键词用于高亮
    setResults([]);
    setGraphData(null);

    try {
      const vectorData = await knowledgeSearch({
        query: trimmed,
        limit: effectiveLimit,
        sessionKey: sessionKey ?? undefined,
        kbId: activeKbId,
      });

      const vectorResults: SearchResult[] = (vectorData.results ?? []).map((r) => ({
        type: "vector" as const,
        id: r.chunkId,
        title: r.filename,
        subtitle: `相关度 ${r.score.toFixed(3)}${r.lines ? ` · 行 ${r.lines}` : ""}`,
        content: r.snippet,
        score: r.score,
        documentId: r.documentId,
      }));

      setResults(vectorResults);
      setSearchResults(vectorData.results ?? [], trimmed);

      if (includeGraph && baseSettings?.graph?.enabled) {
        try {
          const graphResult = await searchKnowledgeGraph({
            kbId: activeKbId,
            query: trimmed,
            mode: graphMode,
            topK: effectiveLimit,
          });
          setGraphData(graphResult);

          const entityResults: SearchResult[] = graphResult.entities.map((e) => ({
            type: "graph_entity" as const,
            id: e.id,
            title: e.name,
            subtitle: `类型: ${e.type || "未知"} · ${e.score.toFixed(3)}`,
            content: e.description || "无描述",
            score: e.score,
            metadata: { type: e.type || "" },
          }));

          const relationResults: SearchResult[] = graphResult.relations.map((r) => ({
            type: "graph_relation" as const,
            id: r.id,
            title: `${r.sourceName} → ${r.targetName}`,
            subtitle: r.keywords.join(", "),
            content: r.description || "无描述",
            score: 0,
          }));

          const chunkResults: SearchResult[] = graphResult.chunks.map((c) => ({
            type: "graph_chunk" as const,
            id: c.id,
            title: "文档片段",
            subtitle: c.score.toFixed(3),
            content: c.text,
            score: c.score,
            documentId: c.documentId,
          }));

          setResults((prev) => [...prev, ...entityResults, ...relationResults, ...chunkResults]);
        } catch (graphErr) {
          // Ignore graph retrieval error
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "检索失败");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredResults = results.filter((r) => {
    if (activeTab === "all") return true;
    if (activeTab === "vector") return r.type === "vector";
    if (activeTab === "graph") return r.type !== "vector";
    return true;
  });

  const vectorCount = results.filter((r) => r.type === "vector").length;
  const graphEntityCount = results.filter((r) => r.type === "graph_entity").length;
  const graphRelationCount = results.filter((r) => r.type === "graph_relation").length;
  const graphChunkCount = results.filter((r) => r.type === "graph_chunk").length;

  return (
    <div className="flex flex-col h-full">
      {/* 顶部搜索区域 */}
      <div className="flex-shrink-0 p-4 border-b border-border-light bg-white">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入检索问题或关键词..."
              className="pl-9 h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
            />
          </div>
          <Button onClick={() => void handleSearch()} disabled={isLoading} className="h-10 px-4">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                检索中
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                检索
              </>
            )}
          </Button>
          <Button variant="outline" size="icon" onClick={handleOpenSettings} className="h-10 w-10">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        {/* 快速设置显示 */}
        <div className="flex items-center gap-2 mt-2 text-xs text-text-tertiary flex-wrap">
          <span className="px-2 py-0.5 bg-background-secondary rounded">
            模式:{" "}
            {retrievalMode === "semantic"
              ? "语义"
              : retrievalMode === "keyword"
                ? "关键词"
                : "混合"}
          </span>
          {retrievalMode === "hybrid" && (
            <span className="px-2 py-0.5 bg-background-secondary rounded">
              Alpha: {localHybridAlpha.toFixed(1)}
            </span>
          )}
          <span className="px-2 py-0.5 bg-background-secondary rounded">TopK: {limit}</span>
          {includeGraph && baseSettings?.graph?.enabled && (
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
              图谱: {graphMode}
            </span>
          )}
        </div>
      </div>

      {/* 结果统计区域 */}
      {hasSearched && !isLoading && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-border-light bg-background-secondary/50">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary font-medium">{results.length} 个结果</span>
            <div className="flex items-center gap-1">
              {[
                { key: "all", label: "全部", count: results.length },
                { key: "vector", label: "向量", count: vectorCount, icon: FileText },
                {
                  key: "graph",
                  label: "图谱",
                  count: graphEntityCount + graphRelationCount + graphChunkCount,
                  icon: Network,
                },
              ].map(({ key, label, count, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    activeTab === key
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:bg-primary/10"
                  }`}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {label} {count}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 结果列表 - 可滚动 */}
      <div className="flex-1 overflow-y-auto scrollbar-default">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-text-tertiary">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在检索知识库...
          </div>
        )}

        {!isLoading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-text-tertiary">
            <Search className="h-10 w-10 mb-3 opacity-30" />
            <span>未找到匹配结果</span>
            <span className="text-xs mt-1">可尝试更换关键词或调整检索参数</span>
          </div>
        )}

        {!isLoading && !hasSearched && (
          <div className="flex flex-col items-center justify-center h-full text-sm text-text-tertiary">
            <Search className="h-12 w-12 mb-3 opacity-20" />
            <span>输入关键词开始检索</span>
          </div>
        )}

        {filteredResults.map((result, index) => (
          <ResultCard
            key={`${result.type}-${result.id}-${index}`}
            result={result}
            keywords={highlightKeywords}
            onNavigate={async () => {
              // 只有向量结果和图谱chunk结果才有documentId可以跳转
              if (
                result.documentId &&
                (result.type === "vector" || result.type === "graph_chunk")
              ) {
                await onOpenDocument?.(result.documentId);
              }
            }}
          />
        ))}
      </div>

      {/* 设置弹窗 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              检索设置
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* 检索模式 */}
            <div className="space-y-3">
              <label className="text-sm font-medium">检索模式</label>
              <Select
                value={localRetrievalMode}
                onValueChange={(v) => setLocalRetrievalMode(v as RetrievalMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semantic">语义检索</SelectItem>
                  <SelectItem value="keyword">关键词检索</SelectItem>
                  <SelectItem value="hybrid">混合检索</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-tertiary">
                语义: 基于向量相似度 | 关键词: 精确匹配 | 混合: 两者结合
              </p>
            </div>

            {/* 混合模式 Alpha */}
            {localRetrievalMode === "hybrid" && (
              <div className="space-y-3">
                <label className="text-sm font-medium">
                  混合比例 Alpha: {localHybridAlpha.toFixed(1)}
                </label>
                <Select
                  value={String(localHybridAlpha)}
                  onValueChange={(v) => setLocalHybridAlpha(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0.0 - 纯关键词</SelectItem>
                    <SelectItem value="0.3">0.3</SelectItem>
                    <SelectItem value="0.5">0.5 - 各50%</SelectItem>
                    <SelectItem value="0.7">0.7</SelectItem>
                    <SelectItem value="1">1.0 - 纯语义</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 最小分数 */}
            <div className="space-y-3">
              <label className="text-sm font-medium">
                最小相关度分数: {localMinScore.toFixed(2)}
              </label>
              <Select
                value={String(localMinScore)}
                onValueChange={(v) => setLocalMinScore(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0.00 - 不过滤</SelectItem>
                  <SelectItem value="0.05">0.05</SelectItem>
                  <SelectItem value="0.1">0.10</SelectItem>
                  <SelectItem value="0.2">0.20</SelectItem>
                  <SelectItem value="0.3">0.30</SelectItem>
                  <SelectItem value="0.5">0.50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 图谱设置 */}
            {baseSettings?.graph?.enabled && (
              <div className="space-y-3 pt-3 border-t border-border-light">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">启用图谱检索</label>
                  <Switch checked={localIncludeGraph} onCheckedChange={setLocalIncludeGraph} />
                </div>

                {localIncludeGraph && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium">图谱检索模式</label>
                    <Select
                      value={localGraphMode}
                      onValueChange={(v) => setLocalGraphMode(v as GraphMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="naive">Naive</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="global">Global</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-text-tertiary">
                      Naive: 简单匹配 | Local: 局部图 | Global: 全局图 | Hybrid: 混合
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 图谱统计 */}
            {hasSearched && graphData && (
              <div className="space-y-3 pt-3 border-t border-border-light">
                <label className="text-sm font-medium">图谱统计</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-semibold text-green-700">{graphEntityCount}</div>
                    <div className="text-xs text-green-600">实体</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-semibold text-blue-700">{graphRelationCount}</div>
                    <div className="text-xs text-blue-600">关系</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-semibold text-purple-700">{graphChunkCount}</div>
                    <div className="text-xs text-purple-600">片段</div>
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2 pt-3 border-t border-border-light">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                取消
              </Button>
              <Button onClick={handleApplySettings}>应用设置</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultCard({
  result,
  keywords,
  onNavigate,
}: {
  result: SearchResult;
  keywords: string[];
  onNavigate: () => void;
}) {
  const typeConfig = {
    vector: { icon: FileText, color: "text-blue-600", bgColor: "bg-blue-100", label: "向量" },
    graph_entity: {
      icon: GitBranch,
      color: "text-green-600",
      bgColor: "bg-green-100",
      label: "实体",
    },
    graph_relation: {
      icon: GitBranch,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
      label: "关系",
    },
    graph_chunk: {
      icon: FileText,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      label: "片段",
    },
  };

  // 只有向量和图谱chunk结果可以跳转到文档
  const canNavigate =
    result.documentId && (result.type === "vector" || result.type === "graph_chunk");

  const config = typeConfig[result.type];
  const Icon = config.icon;

  return (
    <div className="p-4 border-b border-border-light hover:bg-primary/5 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-lg ${config.bgColor}`}>
            <Icon className={`h-4 w-4 ${config.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${config.bgColor} ${config.color} font-medium`}
              >
                {config.label}
              </span>
              <span className="text-sm font-medium text-text-primary truncate">{result.title}</span>
            </div>
            <div className="text-xs text-text-tertiary mt-0.5">{result.subtitle}</div>
            <div className="mt-2 text-xs text-text-secondary line-clamp-3 bg-background-secondary rounded-lg p-2">
              {highlightText(result.content || "无内容", keywords)}
            </div>
          </div>
        </div>
        {canNavigate && (
          <Button size="sm" variant="outline" onClick={onNavigate} className="flex-shrink-0">
            查看
          </Button>
        )}
      </div>
    </div>
  );
}
