"use client";

import { Check, Plus, Settings2, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KnowledgeBaseList } from "@/components/knowledge/KnowledgeBaseList";
import { KnowledgeDetail } from "@/components/knowledge/KnowledgeDetail";
import { KnowledgeIconPicker } from "@/components/knowledge/KnowledgeIconPicker";
import { KnowledgeTagSelector } from "@/components/knowledge/KnowledgeTagSelector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

export function KnowledgeBasePage() {
  const {
    loadKbList,
    kbIds,
    kbTotal,
    kbOffset,
    kbLimit,
    isLoadingKbList,
    selectKb,
    activeDocumentId,
    createKb,
    isCreatingKb,
    availableTags,
    loadAvailableTags,
    createAvailableTag,
    deleteAvailableTag,
    isLoadingTags,
    isUpdatingTags,
  } = useKnowledgeBaseStore();
  const [view, setView] = useState<"list" | "detail">("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("lucide:book");
  const [visibility, setVisibility] = useState<"private" | "team" | "public">("private");
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [vectorizationEnabled, setVectorizationEnabled] = useState(true);
  const [graphEnabled, setGraphEnabled] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [filterTagsOpen, setFilterTagsOpen] = useState(false);
  const [filterTagQuery, setFilterTagQuery] = useState("");
  const [filterVisibility, setFilterVisibility] = useState<"all" | "private" | "team" | "public">(
    "all",
  );
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#64748b");
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    void loadKbList({ offset: 0 });
  }, [loadKbList]);

  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (isLoadingKbList) return;
    if (kbIds.length === 0) return;
    hasAutoSelectedRef.current = true;
    handleOpenDetail(kbIds[0]);
  }, [kbIds, isLoadingKbList]);

  useEffect(() => {
    void loadAvailableTags();
  }, [loadAvailableTags]);

  const handleOpenDetail = (kbId: string) => {
    void selectKb(kbId);
    setView("detail");
  };

  const selectedTags = useMemo(
    () =>
      selectedTagNames.map((name) => {
        const matched = availableTags.find((tag) => tag.name === name);
        return { name, color: matched?.color ?? undefined };
      }),
    [availableTags, selectedTagNames],
  );
  const filteredSearchTags = useMemo(() => {
    const q = filterTagQuery.trim().toLowerCase();
    if (!q) return availableTags;
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [availableTags, filterTagQuery]);
  return (
    <div
      className={
        view === "list"
          ? "flex h-full min-h-0 flex-col p-2xl"
          : "flex h-full min-h-0 flex-col px-2xl pt-2xl pb-0"
      }
    >
      {view === "list" ? (
        <div className="space-y-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">知识库</h2>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
          </div>
          <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-sm">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索知识库名称"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadKbList({
                      offset: 0,
                      search: search.trim() || undefined,
                      visibility: filterVisibility === "all" ? undefined : filterVisibility,
                      tags: selectedFilterTags,
                    });
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void loadKbList({
                    offset: 0,
                    search: search.trim() || undefined,
                    visibility: filterVisibility === "all" ? undefined : filterVisibility,
                    tags: selectedFilterTags,
                  })
                }
              >
                搜索
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setSelectedFilterTags([]);
                  setFilterVisibility("all");
                  void loadKbList({ offset: 0 });
                }}
              >
                清空
              </Button>
            </div>
            <div className="flex items-center gap-sm">
              <Popover open={filterTagsOpen} onOpenChange={setFilterTagsOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    标签筛选{selectedFilterTags.length > 0 ? ` (${selectedFilterTags.length})` : ""}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="!z-[100] w-[20rem] max-w-[92vw] p-sm shadow-xl"
                  align="start"
                  side="bottom"
                  sideOffset={8}
                >
                  <div className="space-y-sm">
                    <Input
                      value={filterTagQuery}
                      onChange={(e) => setFilterTagQuery(e.target.value)}
                      placeholder="搜索标签"
                    />
                    <div className="max-h-56 space-y-1 overflow-auto scrollbar-default pr-1">
                      {filteredSearchTags.map((tag) => {
                        const selected = selectedFilterTags.includes(tag.name);
                        return (
                          <button
                            key={tag.tagId}
                            type="button"
                            className="flex w-full items-center justify-between rounded-md px-sm py-xs text-left hover:bg-primary/5"
                            onClick={() =>
                              setSelectedFilterTags((prev) =>
                                prev.includes(tag.name)
                                  ? prev.filter((name) => name !== tag.name)
                                  : [...prev, tag.name],
                              )
                            }
                          >
                            <span className="inline-flex items-center gap-2 text-xs text-text-primary">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: tag.color ?? "#64748b" }}
                              />
                              {tag.name}
                            </span>
                            {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        void loadKbList({
                          offset: 0,
                          search: search.trim() || undefined,
                          visibility: filterVisibility === "all" ? undefined : filterVisibility,
                          tags: selectedFilterTags,
                        });
                        setFilterTagsOpen(false);
                      }}
                    >
                      应用筛选
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setManageTagsOpen(true)}
                title="标签管理"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-sm">
              <Select
                value={filterVisibility}
                onValueChange={(value: typeof filterVisibility) => {
                  setFilterVisibility(value);
                  void loadKbList({
                    offset: 0,
                    search: search.trim() || undefined,
                    visibility: value === "all" ? undefined : value,
                    tags: selectedFilterTags,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue placeholder="全部权限" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部权限</SelectItem>
                  <SelectItem value="private">仅自己</SelectItem>
                  <SelectItem value="team">团队</SelectItem>
                  <SelectItem value="public">公开</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <KnowledgeBaseList
            kbIds={kbIds}
            total={kbTotal}
            offset={kbOffset}
            limit={kbLimit}
            isLoading={isLoadingKbList}
            onOpenDetail={handleOpenDetail}
            onPageChange={(nextOffset) =>
              void loadKbList({
                offset: nextOffset,
                limit: kbLimit,
                search: search.trim() || undefined,
                visibility: filterVisibility === "all" ? undefined : filterVisibility,
                tags: selectedFilterTags,
              })
            }
            onLimitChange={(nextLimit) =>
              void loadKbList({
                offset: 0,
                limit: nextLimit,
                search: search.trim() || undefined,
                visibility: filterVisibility === "all" ? undefined : filterVisibility,
                tags: selectedFilterTags,
              })
            }
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <KnowledgeDetail
            activeDocumentId={activeDocumentId}
            onBack={() => {
              void selectKb(null);
              setView("list");
            }}
          />
        </div>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[64rem] w-[90vw]">
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm">
            <div>
              <div className="text-xs text-text-tertiary mb-xs">名称与图标</div>
              <div className="flex items-center gap-sm">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：员工手册"
                />
                <KnowledgeIconPicker value={icon} onChange={setIcon} />
              </div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary mb-xs">描述</div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选，用于说明知识库用途"
                rows={3}
              />
            </div>
            <div>
              <div className="text-xs text-text-tertiary mb-xs">权限</div>
              <Select
                value={visibility}
                onValueChange={(value: typeof visibility) => setVisibility(value)}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="仅自己" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">仅自己</SelectItem>
                  <SelectItem value="team">团队</SelectItem>
                  <SelectItem value="public">公开</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-text-tertiary mb-xs">标签</div>
              <KnowledgeTagSelector
                selectedTagNames={selectedTagNames}
                availableTags={availableTags}
                isLoadingTags={isLoadingTags}
                isUpdatingTags={isUpdatingTags}
                onChange={setSelectedTagNames}
                onCreateTag={createAvailableTag}
                onDeleteTag={deleteAvailableTag}
                popoverSide="top"
              />
            </div>
            <div className="rounded-md border border-border-light p-sm space-y-sm">
              <div className="text-xs font-medium text-text-secondary">基础设置</div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={vectorizationEnabled}
                  onChange={(e) => setVectorizationEnabled(e.target.checked)}
                />
                启用向量化
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={graphEnabled}
                  onChange={(e) => setGraphEnabled(e.target.checked)}
                />
                启用图谱化
              </label>
            </div>
            {createError && <div className="text-xs text-error">{createError}</div>}
            <div className="flex justify-end gap-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
                disabled={isCreatingKb}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={!name.trim() || isCreatingKb}
                onClick={async () => {
                  setCreateError(null);
                  try {
                    await createKb({
                      name: name.trim(),
                      description: description.trim() || undefined,
                      icon,
                      visibility,
                      tags: selectedTags,
                      settings: {
                        vectorization: {
                          enabled: vectorizationEnabled,
                        },
                        chunk: {
                          enabled: vectorizationEnabled,
                          size: 800,
                          overlap: 120,
                          separator: "auto",
                        },
                        graph: {
                          enabled: graphEnabled,
                        },
                      },
                    });
                    setCreateOpen(false);
                    setName("");
                    setDescription("");
                    setIcon("lucide:book");
                    setSelectedTagNames([]);
                    setVisibility("private");
                    setVectorizationEnabled(true);
                    setGraphEnabled(false);
                  } catch (error) {
                    setCreateError(error instanceof Error ? error.message : "创建失败");
                  }
                }}
              >
                {isCreatingKb ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={manageTagsOpen} onOpenChange={setManageTagsOpen}>
        <DialogContent className="w-[42rem] max-w-[92vw] p-6 border-0">
          <DialogHeader>
            <DialogTitle>标签管理</DialogTitle>
          </DialogHeader>
          <div className="space-y-md">
            <div className="flex items-center gap-sm">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="新标签名称"
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                {[
                  "#64748b",
                  "#ef4444",
                  "#f97316",
                  "#eab308",
                  "#22c55e",
                  "#14b8a6",
                  "#3b82f6",
                  "#8b5cf6",
                  "#ec4899",
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      newTagColor === color
                        ? "border-text-primary scale-110"
                        : "border-transparent hover:scale-110"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                    title={color}
                  />
                ))}
              </div>
              <Button
                size="sm"
                disabled={isUpdatingTags || !newTagName.trim()}
                onClick={async () => {
                  await createAvailableTag({ name: newTagName.trim(), color: newTagColor });
                  setNewTagName("");
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            <div className="max-h-64 space-y-1 overflow-auto scrollbar-default pr-1">
              {availableTags.map((tag) => {
                const isSelected = selectedFilterTags.includes(tag.name);
                return (
                  <div
                    key={tag.tagId}
                    className="flex items-center justify-between rounded-md px-sm py-xs"
                  >
                    <div className="inline-flex items-center gap-2 text-sm">
                      <Tag className="h-3.5 w-3.5 text-text-tertiary" />
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: tag.color ?? "#64748b" }}
                      />
                      <span>{tag.name}</span>
                      {isSelected ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          已选择
                        </span>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-error hover:text-error"
                      disabled={isUpdatingTags}
                      onClick={async () => {
                        await deleteAvailableTag(tag.tagId);
                        setSelectedFilterTags((prev) => prev.filter((name) => name !== tag.name));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
