"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { Save, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeIconPicker } from "@/components/knowledge/KnowledgeIconPicker";
import { KnowledgeTagSelector } from "@/components/knowledge/KnowledgeTagSelector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConnectionStore } from "@/stores/connectionStore";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";
import { useToastStore } from "@/stores/toastStore";

type ModelCatalogEntry = {
  id: string;
  provider: string;
  name?: string;
};

type ConfigProviderModel = {
  id?: string;
  name?: string;
};

type ConfigProvider = {
  models?: ConfigProviderModel[];
};

type ParsedConfig = {
  agents?: {
    defaults?: {
      model?: string | { primary?: string };
    };
  };
  models?: {
    providers?: Record<string, ConfigProvider>;
  };
};

type SettingRowProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SettingRow({ title, description, children }: SettingRowProps) {
  return (
    <div className="grid gap-md rounded-xl border border-border-light bg-slate-50/70 p-md md:grid-cols-[210px_minmax(0,1fr)] md:items-start">
      <div>
        <div className="text-sm font-medium text-text-primary">{title}</div>
        {description ? <div className="mt-1 text-xs text-text-tertiary">{description}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function KnowledgeSettingsTab() {
  const graphExtractorOptions = useMemo(
    () => [{ value: "llm", label: "LLM 抽取器（当前可用）" }],
    [],
  );
  const {
    loadSettings,
    settings,
    baseSettings,
    availableTags,
    isLoadingSettings,
    isUpdatingSettings,
    isLoadingBaseSettings,
    isUpdatingBaseSettings,
    isLoadingTags,
    isUpdatingTags,
    updateSettings,
    loadBaseSettings,
    updateBaseSettings,
    loadAvailableTags,
    createAvailableTag,
    deleteAvailableTag,
    activeKbId,
    kbDetail,
    updateKb,
    isUpdatingKb,
    deleteKb,
    isDeletingKb,
  } = useKnowledgeBaseStore();

  const { addToast } = useToastStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("lucide:book");
  const [visibility, setVisibility] = useState<"private" | "team" | "public">("private");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [kbInfoDirty, setKbInfoDirty] = useState(false);
  const [tagDirty, setTagDirty] = useState(false);
  const [baseRetrievalDirty, setBaseRetrievalDirty] = useState(false);
  const [vectorDirty, setVectorDirty] = useState(false);
  const [graphDirty, setGraphDirty] = useState(false);

  const [chunkEnabled, setChunkEnabled] = useState(true);
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(120);
  const [chunkSeparator, setChunkSeparator] = useState<"auto" | "paragraph" | "sentence">("auto");
  const [indexMode, setIndexMode] = useState<"high_quality" | "balanced">("balanced");
  const [retrievalMode, setRetrievalMode] = useState<"semantic" | "keyword" | "hybrid">("hybrid");
  const [retrievalTopK, setRetrievalTopK] = useState(5);
  const [retrievalMinScore, setRetrievalMinScore] = useState(0.35);
  const [hybridAlpha, setHybridAlpha] = useState(0.5);
  const [baseGraphEnabled, setBaseGraphEnabled] = useState(false);

  const [vectorEnabled, setVectorEnabled] = useState(false);
  const [vectorProvider, setVectorProvider] = useState("auto");
  const [vectorModel, setVectorModel] = useState("");

  const [graphExtractor, setGraphExtractor] = useState<"llm">("llm");
  const [graphProvider, setGraphProvider] = useState("auto");
  const [graphModel, setGraphModel] = useState("");

  const [includeInMemorySearch, setIncludeInMemorySearch] = useState(true);
  const [searchDirty, setSearchDirty] = useState(false);

  const [providerOptions, setProviderOptions] = useState<string[]>(["auto"]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({ auto: [] });
  const [systemDefaultModel, setSystemDefaultModel] = useState("");
  const wsClient = useConnectionStore((state) => state.wsClient);

  const selectedTags = useMemo(
    () =>
      selectedTagNames.map((name) => {
        const matched = availableTags.find((tag) => tag.name === name);
        return { name, color: matched?.color ?? undefined };
      }),
    [availableTags, selectedTagNames],
  );
  const baseValidationError = useMemo(() => {
    if (chunkSize < 200 || chunkSize > 4000) return "Chunk 大小需在 200-4000 之间";
    if (chunkOverlap < 0 || chunkOverlap > 1000) return "Chunk 重叠需在 0-1000 之间";
    if (chunkOverlap >= chunkSize) return "Chunk 重叠必须小于 Chunk 大小";
    if (retrievalTopK < 1 || retrievalTopK > 20) return "TopK 需在 1-20 之间";
    if (retrievalMinScore < 0 || retrievalMinScore > 1) return "最小分数需在 0-1 之间";
    if (hybridAlpha < 0 || hybridAlpha > 1) return "Hybrid Alpha 需在 0-1 之间";
    return null;
  }, [chunkOverlap, chunkSize, hybridAlpha, retrievalMinScore, retrievalTopK]);

  const loadModelOptions = useCallback(async () => {
    if (!wsClient) return;

    const [catalogResult, configResult] = await Promise.allSettled([
      wsClient.sendRequest<{ models: ModelCatalogEntry[] }>("models.list", {}),
      wsClient.sendRequest<{ raw: string; parsed?: ParsedConfig }>("config.get", {}),
    ]);

    const fallbackModelsByProvider: Record<string, string[]> = {
      auto: ["text-embedding-3-small", "text-embedding-3-large", "gemini-2.0-flash"],
      openai: ["text-embedding-3-small", "text-embedding-3-large", "gpt-4o-mini"],
      gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
      local: ["nomic-embed-text", "bge-m3"],
    };
    const modelMap = new Map<string, Set<string>>(
      Object.entries(fallbackModelsByProvider).map(([provider, models]) => [
        provider,
        new Set(models),
      ]),
    );
    const providers = new Set<string>(["auto", "openai", "gemini", "local"]);
    let defaultModel = "";
    let defaultProvider = "";

    if (configResult.status === "fulfilled") {
      // Use config first (has original values), fallback to parsed (may be redacted)
      let parsed: ParsedConfig | null =
        (configResult.value as { config?: ParsedConfig })?.config ??
        configResult.value?.parsed ??
        null;
      if (!parsed && configResult.value?.raw) {
        try {
          parsed = JSON.parse(configResult.value.raw) as ParsedConfig;
        } catch {
          parsed = null;
        }
      }
      const cfgProviders = parsed?.models?.providers;
      const cfgDefaultModel = parsed?.agents?.defaults?.model;
      defaultModel =
        typeof cfgDefaultModel === "string" ? cfgDefaultModel : (cfgDefaultModel?.primary ?? "");
      defaultProvider = defaultModel.includes("/") ? defaultModel.split("/", 1)[0] : "";

      if (cfgProviders && typeof cfgProviders === "object") {
        for (const [provider, providerConfig] of Object.entries(cfgProviders)) {
          const normalizedProvider = provider.trim();
          if (!normalizedProvider) continue;
          providers.add(normalizedProvider);
          const current = modelMap.get(normalizedProvider) ?? new Set<string>();
          for (const model of providerConfig?.models ?? []) {
            const modelId = String(model?.id ?? model?.name ?? "").trim();
            if (modelId) current.add(modelId);
          }
          modelMap.set(normalizedProvider, current);
        }
      }
    }

    if (catalogResult.status === "fulfilled") {
      for (const model of catalogResult.value?.models ?? []) {
        const provider = model.provider?.trim();
        const modelId = model.id?.trim();
        if (!provider || !modelId) continue;
        providers.add(provider);
        const current = modelMap.get(provider) ?? new Set<string>();
        current.add(modelId);
        modelMap.set(provider, current);
        modelMap.get("auto")?.add(modelId);
      }
    }

    setSystemDefaultModel(defaultModel);
    setProviderOptions([
      "auto",
      ...Array.from(providers)
        .filter((item) => item !== "auto")
        .sort(),
    ]);
    setModelsByProvider(
      Array.from(modelMap.entries()).reduce<Record<string, string[]>>(
        (acc, [provider, models]) => {
          acc[provider] = Array.from(models).sort();
          return acc;
        },
        { auto: [] },
      ),
    );

    if (defaultProvider && !providers.has(defaultProvider)) {
      providers.add(defaultProvider);
      setProviderOptions([
        "auto",
        ...Array.from(providers)
          .filter((item) => item !== "auto")
          .sort(),
      ]);
    }
  }, [wsClient]);

  useEffect(() => {
    void loadSettings();
    void loadAvailableTags();
  }, [loadAvailableTags, loadSettings]);

  useEffect(() => {
    if (!activeKbId) return;
    setKbInfoDirty(false);
    setTagDirty(false);
    setBaseRetrievalDirty(false);
    setVectorDirty(false);
    setGraphDirty(false);
    void loadBaseSettings();
  }, [activeKbId, loadBaseSettings]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadModelOptions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadModelOptions]);

  useEffect(() => {
    if (!kbDetail) return;
    if (kbInfoDirty || tagDirty) return;
    setName(kbDetail.name ?? "");
    setDescription(kbDetail.description ?? "");
    setIcon(kbDetail.icon ?? "lucide:book");
    setVisibility((kbDetail.visibility ?? "private") as "private" | "team" | "public");
    setSelectedTagNames((kbDetail.tags ?? []).map((item) => item.name));
  }, [kbDetail, kbInfoDirty, tagDirty]);

  useEffect(() => {
    if (!baseSettings) return;
    if (baseRetrievalDirty || graphDirty || vectorDirty) return;
    if (!baseSettings.vectorization) return;
    if (!baseSettings.chunk) return;
    if (!baseSettings.index) return;
    if (!baseSettings.retrieval) return;
    if (!baseSettings.graph) return;
    setVectorEnabled(Boolean(baseSettings.vectorization.enabled));
    setChunkEnabled(Boolean(baseSettings.chunk.enabled));
    setChunkSize(baseSettings.chunk.size);
    setChunkOverlap(baseSettings.chunk.overlap);
    setChunkSeparator(baseSettings.chunk.separator);
    setIndexMode(baseSettings.index.mode);
    setRetrievalMode(baseSettings.retrieval.mode);
    setRetrievalTopK(baseSettings.retrieval.topK);
    setRetrievalMinScore(baseSettings.retrieval.minScore);
    setHybridAlpha(baseSettings.retrieval.hybridAlpha);
    setBaseGraphEnabled(Boolean(baseSettings.graph.enabled));
  }, [baseRetrievalDirty, baseSettings, graphDirty, vectorDirty]);

  const fallbackProvider = useMemo(() => {
    if (systemDefaultModel.includes("/")) {
      return systemDefaultModel.split("/", 1)[0];
    }
    const firstConfiguredProvider = providerOptions.find((provider) => provider !== "auto");
    return firstConfiguredProvider ?? "auto";
  }, [providerOptions, systemDefaultModel]);

  const getModelOptions = useCallback(
    (provider: string, currentModel: string) => {
      const fromProvider = modelsByProvider[provider] ?? [];
      const fromAuto = provider === "auto" ? (modelsByProvider.auto ?? []) : [];
      const merged = new Set<string>([...fromProvider, ...fromAuto]);
      const normalizedCurrent = currentModel.trim();
      if (normalizedCurrent) merged.add(normalizedCurrent);
      return Array.from(merged).sort();
    },
    [modelsByProvider],
  );

  const resolveDefaultModel = useCallback(
    (provider: string) => {
      const providerModels = getModelOptions(provider, "");
      if (providerModels.length > 0) {
        if (systemDefaultModel) {
          if (provider === "auto" && providerModels.includes(systemDefaultModel))
            return systemDefaultModel;
          if (provider !== "auto" && systemDefaultModel.startsWith(`${provider}/`))
            return systemDefaultModel;
        }
        return providerModels[0] ?? "";
      }
      return systemDefaultModel;
    },
    [getModelOptions, systemDefaultModel],
  );

  useEffect(() => {
    if (!settings) return;
    if (vectorDirty || graphDirty || searchDirty) return;
    if (!settings.vectorization) return;
    if (!settings.graph) return;
    const vectorProviderValue = settings.vectorization.provider || fallbackProvider || "auto";
    const vectorModelValue =
      settings.vectorization.model || resolveDefaultModel(vectorProviderValue);
    setVectorEnabled(Boolean(settings.vectorization.enabled));
    setVectorProvider(vectorProviderValue);
    setVectorModel(vectorModelValue);

    const graphProviderValue = settings.graph.provider || fallbackProvider || "auto";
    const graphModelValue = settings.graph.model || resolveDefaultModel(graphProviderValue);
    setGraphExtractor(settings.graph.extractor || "llm");
    setGraphProvider(graphProviderValue);
    setGraphModel(graphModelValue);

    // 加载 search 配置
    setIncludeInMemorySearch(settings.search?.includeInMemorySearch ?? true);
  }, [fallbackProvider, graphDirty, resolveDefaultModel, searchDirty, settings, vectorDirty]);

  if (!activeKbId) {
    return (
      <div className="rounded-xl border border-border-light p-lg text-sm text-text-tertiary">
        请先选择知识库。
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 space-y-lg overflow-auto pr-xs pb-md scrollbar-thin [overscroll-behavior:contain]">
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>删除知识库</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm">
            <p className="text-text-secondary">
              确定要删除知识库「{kbDetail?.name || "当前知识库"}」吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(false)}
                disabled={isDeletingKb}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-error text-white hover:bg-error/90"
                disabled={isDeletingKb}
                onClick={async () => {
                  if (!activeKbId) return;
                  await deleteKb(activeKbId);
                  setDeleteOpen(false);
                }}
              >
                {isDeletingKb ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border-light bg-background p-lg">
        <div className="mb-md flex items-center justify-between">
          <div className="text-sm font-semibold text-text-primary">知识库信息</div>
          <div className="flex items-center gap-sm">
            <Button
              size="sm"
              variant="outline"
              className="text-error border-error/30 hover:bg-error/10"
              disabled={isDeletingKb}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-xs h-3.5 w-3.5" />
              {isDeletingKb ? "删除中..." : "删除知识库"}
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || isUpdatingKb}
              onClick={async () => {
                setUpdateError(null);
                try {
                  await updateKb({
                    kbId: activeKbId,
                    name: name.trim(),
                    description: description.trim() || undefined,
                    icon,
                    visibility,
                    tags: selectedTags,
                  });
                  setKbInfoDirty(false);
                  setTagDirty(false);
                  addToast({ title: "知识库信息已保存", variant: "success" });
                } catch (error) {
                  setUpdateError(error instanceof Error ? error.message : "保存失败");
                  addToast({ title: "知识库信息保存失败", variant: "error" });
                }
              }}
            >
              {isUpdatingKb ? "保存中..." : "保存知识库"}
            </Button>
          </div>
        </div>
        <div className="space-y-md">
          <SettingRow title="名称与图标" description="知识库名称和展示图标。">
            <div className="flex items-center gap-sm">
              <Input
                value={name}
                onChange={(e) => {
                  setKbInfoDirty(true);
                  setName(e.target.value);
                }}
              />
              <KnowledgeIconPicker
                value={icon}
                onChange={(next) => {
                  setKbInfoDirty(true);
                  setIcon(next);
                }}
              />
            </div>
          </SettingRow>
          <SettingRow title="描述" description="用于补充知识库用途，便于团队识别。">
            <Textarea
              value={description}
              onChange={(e) => {
                setKbInfoDirty(true);
                setDescription(e.target.value);
              }}
              rows={3}
              placeholder="可选"
            />
          </SettingRow>
          <SettingRow title="权限" description="控制知识库可见范围。">
            <Select
              value={visibility}
              onValueChange={(value) => {
                setKbInfoDirty(true);
                setVisibility(value as "private" | "team" | "public");
              }}
            >
              <SelectTrigger className="w-full" size="default">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" position="popper" className="z-50 bg-white">
                <SelectItem value="private">仅自己</SelectItem>
                <SelectItem value="team">团队</SelectItem>
                <SelectItem value="public">公开</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow title="标签" description="用于分类和筛选知识库。">
            <KnowledgeTagSelector
              selectedTagNames={selectedTagNames}
              availableTags={availableTags}
              isLoadingTags={isLoadingTags}
              isUpdatingTags={isUpdatingTags}
              onChange={(next) => {
                setTagDirty(true);
                setSelectedTagNames(next);
              }}
              onCreateTag={createAvailableTag}
              onDeleteTag={deleteAvailableTag}
            />
          </SettingRow>
        </div>
        {updateError ? <div className="mt-sm text-xs text-error">{updateError}</div> : null}
      </div>

      <div className="rounded-xl border border-border-light bg-background p-lg">
        <div className="mb-md flex items-center justify-between">
          <div className="text-sm font-semibold text-text-primary">向量化</div>
          <Button
            size="sm"
            disabled={
              isLoadingSettings ||
              isUpdatingSettings ||
              isUpdatingBaseSettings ||
              Boolean(baseValidationError)
            }
            onClick={async () => {
              setSettingsError(null);
              try {
                await Promise.all([
                  updateSettings({
                    vectorization: {
                      enabled: vectorEnabled,
                      provider: vectorProvider,
                      model: vectorModel,
                    },
                  }),
                  updateBaseSettings({
                    settings: {
                      vectorization: {
                        enabled: vectorEnabled,
                      },
                      chunk: {
                        enabled: chunkEnabled,
                        size: chunkSize,
                        overlap: chunkOverlap,
                        separator: chunkSeparator,
                      },
                      index: {
                        mode: indexMode,
                      },
                    },
                  }),
                ]);
                setVectorDirty(false);
                setBaseRetrievalDirty(false);
                addToast({ title: "向量化设置已保存", variant: "success" });
              } catch (error) {
                setSettingsError(error instanceof Error ? error.message : "向量化设置保存失败");
                addToast({ title: "向量化设置保存失败", variant: "error" });
              }
            }}
          >
            <Save className="mr-xs h-3.5 w-3.5" />
            {isUpdatingSettings ? "保存中..." : "保存向量化设置"}
          </Button>
        </div>
        {isLoadingSettings ? (
          <div className="text-sm text-text-tertiary">加载向量化设置中...</div>
        ) : !settings ? (
          <div className="text-sm text-text-tertiary">暂无向量化设置数据。</div>
        ) : (
          <div className="space-y-md">
            <SettingRow title="启用向量化" description="控制当前知识库是否进行分块与向量索引。">
              <input
                type="checkbox"
                checked={vectorEnabled}
                onChange={(e) => {
                  setVectorDirty(true);
                  setBaseRetrievalDirty(true);
                  setVectorEnabled(e.target.checked);
                  setChunkEnabled(e.target.checked);
                }}
                className="h-4 w-4"
              />
            </SettingRow>
            <SettingRow title="Chunk 大小" description="每个分块的最大字符数。">
              <Input
                type="number"
                value={chunkSize}
                onChange={(e) => {
                  setBaseRetrievalDirty(true);
                  setChunkSize(Number(e.target.value) || 0);
                }}
              />
            </SettingRow>
            <SettingRow title="Chunk 重叠" description="相邻分块重叠字符数，用于保留上下文。">
              <Input
                type="number"
                value={chunkOverlap}
                onChange={(e) => {
                  setBaseRetrievalDirty(true);
                  setChunkOverlap(Number(e.target.value) || 0);
                }}
              />
            </SettingRow>
            <SettingRow title="分块策略" description="文本分块的分隔方式。">
              <Select
                value={chunkSeparator}
                onValueChange={(value) => {
                  setBaseRetrievalDirty(true);
                  setChunkSeparator(value as typeof chunkSeparator);
                }}
              >
                <SelectTrigger className="w-full" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  <SelectItem value="auto">自动分隔</SelectItem>
                  <SelectItem value="paragraph">按段落</SelectItem>
                  <SelectItem value="sentence">按句子</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="索引模式" description="决定索引质量和构建成本。">
              <Select
                value={indexMode}
                onValueChange={(value) => {
                  setBaseRetrievalDirty(true);
                  setIndexMode(value as typeof indexMode);
                }}
              >
                <SelectTrigger className="w-full" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  <SelectItem value="balanced">标准索引</SelectItem>
                  <SelectItem value="high_quality">高质量索引</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="向量 Provider" description="向量模型提供商。">
              <Select
                value={vectorProvider}
                onValueChange={(value) => {
                  setVectorDirty(true);
                  const nextProvider = value;
                  setVectorProvider(nextProvider);
                  const options = getModelOptions(nextProvider, vectorModel);
                  if (options.length > 0 && !options.includes(vectorModel)) {
                    setVectorModel(resolveDefaultModel(nextProvider));
                  }
                }}
              >
                <SelectTrigger className="w-full" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="向量 Model" description="用于向量化的具体模型。">
              <Select
                value={vectorModel}
                onValueChange={(value) => {
                  setVectorDirty(true);
                  setVectorModel(value);
                }}
              >
                <SelectTrigger
                  className="w-full"
                  size="default"
                  disabled={getModelOptions(vectorProvider, vectorModel).length === 0}
                >
                  <SelectValue placeholder="未检测到模型" />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  {getModelOptions(vectorProvider, vectorModel).map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            {baseValidationError ? (
              <div className="text-xs text-error">{baseValidationError}</div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-light bg-background p-lg">
        <div className="mb-md flex items-center justify-between">
          <div className="text-sm font-semibold text-text-primary">检索</div>
          <Button
            size="sm"
            disabled={
              isUpdatingBaseSettings || isLoadingBaseSettings || Boolean(baseValidationError)
            }
            onClick={async () => {
              setSettingsError(null);
              try {
                await Promise.all([
                  updateSettings({
                    kbId: activeKbId ?? undefined,
                    search: {
                      includeInMemorySearch,
                    },
                  }),
                  updateBaseSettings({
                    settings: {
                      retrieval: {
                        mode: retrievalMode,
                        topK: retrievalTopK,
                        minScore: retrievalMinScore,
                        hybridAlpha,
                      },
                    },
                  }),
                ]);
                setBaseRetrievalDirty(false);
                setSearchDirty(false);
                addToast({ title: "检索设置已保存", variant: "success" });
              } catch (error) {
                setSettingsError(error instanceof Error ? error.message : "检索设置保存失败");
                addToast({ title: "检索设置保存失败", variant: "error" });
              }
            }}
          >
            {isUpdatingBaseSettings ? "保存中..." : "保存检索设置"}
          </Button>
        </div>
        <div className="space-y-md">
          <SettingRow title="检索模式" description="决定召回方式：语义、关键词或混合。">
            <Select
              value={retrievalMode}
              onValueChange={(value) => {
                setBaseRetrievalDirty(true);
                setRetrievalMode(value as typeof retrievalMode);
              }}
            >
              <SelectTrigger className="w-full" size="default">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" position="popper" className="z-50 bg-white">
                <SelectItem value="hybrid">混合检索</SelectItem>
                <SelectItem value="semantic">语义检索</SelectItem>
                <SelectItem value="keyword">关键词检索</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow title="Top K" description="每次检索最多返回的候选数量。">
            <Input
              type="number"
              value={retrievalTopK}
              onChange={(e) => {
                setBaseRetrievalDirty(true);
                setRetrievalTopK(Number(e.target.value) || 0);
              }}
            />
          </SettingRow>
          <SettingRow title="最小分数阈值" description="低于该分数的结果会被过滤。">
            <Input
              type="number"
              step="0.01"
              value={retrievalMinScore}
              onChange={(e) => {
                setBaseRetrievalDirty(true);
                setRetrievalMinScore(Number(e.target.value) || 0);
              }}
            />
          </SettingRow>
          {retrievalMode === "hybrid" ? (
            <SettingRow title="Hybrid Alpha" description="语义分数权重，越大越偏向语义检索。">
              <Input
                type="number"
                step="0.01"
                value={hybridAlpha}
                onChange={(e) => {
                  setBaseRetrievalDirty(true);
                  setHybridAlpha(Number(e.target.value) || 0);
                }}
              />
            </SettingRow>
          ) : null}
          <SettingRow
            title="对话时自动搜索"
            description="在普通对话中自动搜索该知识库内容，无需手动触发。"
          >
            <input
              type="checkbox"
              checked={includeInMemorySearch}
              onChange={(e) => {
                setSearchDirty(true);
                setIncludeInMemorySearch(e.target.checked);
              }}
              className="h-4 w-4"
            />
          </SettingRow>
          {baseValidationError ? (
            <div className="text-xs text-error">{baseValidationError}</div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border-light bg-background p-lg">
        <div className="mb-md flex items-center justify-between">
          <div className="text-sm font-semibold text-text-primary">图谱化</div>
          <Button
            size="sm"
            disabled={isLoadingSettings || isUpdatingSettings}
            onClick={async () => {
              setSettingsError(null);
              try {
                // 保存图谱设置 - 同时更新 base 和 agent 级别
                await Promise.all([
                  updateSettings({
                    kbId: activeKbId ?? undefined,
                    graph: {
                      enabled: baseGraphEnabled,
                      extractor: graphExtractor,
                      provider: graphProvider,
                      model: graphModel,
                    },
                  }),
                  updateBaseSettings({
                    settings: {
                      graph: {
                        enabled: baseGraphEnabled,
                      },
                    },
                  }),
                ]);
                setGraphDirty(false);
                addToast({ title: "图谱化设置已保存", variant: "success" });
              } catch (error) {
                setSettingsError(error instanceof Error ? error.message : "图谱化设置保存失败");
                addToast({ title: "图谱化设置保存失败", variant: "error" });
              }
            }}
          >
            <Save className="mr-xs h-3.5 w-3.5" />
            {isUpdatingSettings ? "保存中..." : "保存图谱化设置"}
          </Button>
        </div>
        {isLoadingSettings ? (
          <div className="text-sm text-text-tertiary">加载图谱化设置中...</div>
        ) : !settings ? (
          <div className="text-sm text-text-tertiary">暂无图谱化设置数据。</div>
        ) : (
          <div className="space-y-md">
            <SettingRow title="启用图谱化" description="控制当前知识库是否执行实体关系抽取。">
              <input
                type="checkbox"
                checked={baseGraphEnabled}
                onChange={(e) => {
                  setGraphDirty(true);
                  setBaseGraphEnabled(e.target.checked);
                }}
                className="h-4 w-4"
              />
            </SettingRow>
            <SettingRow
              title="图谱抽取器类型"
              description="选择图谱三元组抽取方式，当前版本仅支持 LLM。"
            >
              <Select
                value={graphExtractor}
                onValueChange={(value) => {
                  setGraphDirty(true);
                  setGraphExtractor(value as "llm");
                }}
                disabled={!baseGraphEnabled}
              >
                <SelectTrigger className="w-full" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  {graphExtractorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="Provider" description="图谱抽取模型的提供商。">
              <Select
                value={graphProvider}
                onValueChange={(value) => {
                  setGraphDirty(true);
                  const nextProvider = value;
                  setGraphProvider(nextProvider);
                  const options = getModelOptions(nextProvider, graphModel);
                  if (options.length > 0 && !options.includes(graphModel)) {
                    setGraphModel(resolveDefaultModel(nextProvider));
                  }
                }}
                disabled={!baseGraphEnabled}
              >
                <SelectTrigger className="w-full" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="Model" description="图谱抽取使用的具体模型。">
              <Select
                value={graphModel}
                onValueChange={(value) => {
                  setGraphDirty(true);
                  setGraphModel(value);
                }}
                disabled={!baseGraphEnabled}
              >
                <SelectTrigger
                  className="w-full"
                  size="default"
                  disabled={
                    !baseGraphEnabled || getModelOptions(graphProvider, graphModel).length === 0
                  }
                >
                  <SelectValue placeholder="未检测到模型" />
                </SelectTrigger>
                <SelectContent side="top" position="popper" className="z-50 bg-white">
                  {getModelOptions(graphProvider, graphModel).map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        )}
        {settingsError ? <div className="mt-sm text-xs text-error">{settingsError}</div> : null}
      </div>
    </div>
  );
}
