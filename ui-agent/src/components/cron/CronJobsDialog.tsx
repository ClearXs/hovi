"use client";

import { Clock, Plus, Loader2, Activity } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  fetchCronStatus,
  fetchCronJobs,
  createCronJob,
  updateCronJob,
  deleteCronJob,
  runCronJob,
} from "@/features/cron/api/cronApi";
import { useConnectionStore } from "@/stores/connectionStore";
import type { CronJob, CronJobCreate, CronJobPatch, CronStatus } from "@/types/cron";
import { CronJobForm } from "./CronJobForm";
import { CronJobsList } from "./CronJobsList";

interface CronJobsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CronJobsDialog({ open, onOpenChange }: CronJobsDialogProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    if (!wsClient) return;
    try {
      setLoading(true);
      const [statusResult, jobsResult] = await Promise.all([
        fetchCronStatus(wsClient),
        fetchCronJobs(wsClient),
      ]);
      setStatus(statusResult);
      setJobs(jobsResult.jobs);
    } catch (error) {
      console.error("Failed to load cron data:", error);
    } finally {
      setLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    if (open && wsClient) {
      loadData();
    }
  }, [open, wsClient, loadData]);

  // Subscribe to cron events
  useEffect(() => {
    if (!wsClient || !open) return;

    const handleCronEvent = (event: unknown) => {
      console.log("Cron event:", event);
      loadData();
    };

    wsClient.addEventListener("cron", handleCronEvent);
    return () => {
      wsClient.removeEventListener("cron", handleCronEvent);
    };
  }, [wsClient, open, loadData]);

  // Handlers
  const handleCreate = async (data: CronJobCreate) => {
    if (!wsClient) return;
    try {
      setCreating(true);
      await createCronJob(wsClient, data);
      await loadData();
      setFormOpen(false);
    } catch (error) {
      console.error("Failed to create cron job:", error);
      alert("创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string, patch: CronJobPatch) => {
    if (!wsClient) return;
    try {
      await updateCronJob(wsClient, id, patch);
      await loadData();
      setEditingJob(null);
      setFormOpen(false);
    } catch (error) {
      console.error("Failed to update cron job:", error);
      alert("更新失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!wsClient) return;
    if (!confirm("确定要删除这个定时任务吗？")) return;
    try {
      await deleteCronJob(wsClient, id);
      await loadData();
    } catch (error) {
      console.error("Failed to delete cron job:", error);
      alert("删除失败");
    }
  };

  const handleRun = async (id: string) => {
    if (!wsClient) return;
    try {
      await runCronJob(wsClient, id, "force");
    } catch (error) {
      console.error("Failed to run cron job:", error);
      alert("触发失败");
    }
  };

  const handleToggle = async (job: CronJob) => {
    if (!wsClient) return;
    try {
      await updateCronJob(wsClient, job.id, { enabled: !job.enabled });
      await loadData();
    } catch (error) {
      console.error("Failed to toggle cron job:", error);
    }
  };

  const handleOpenCreate = () => {
    setEditingJob(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (job: CronJob) => {
    setEditingJob(job);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingJob(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[48rem] h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">定时任务</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="jobs" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-6 mt-4 mb-0 justify-start bg-transparent border-b border-border-light rounded-none p-0 h-auto gap-0">
              <TabsTrigger
                value="status"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
              >
                <Activity className="w-4 h-4" />
                <span className="text-sm">状态</span>
              </TabsTrigger>
              <TabsTrigger
                value="jobs"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
              >
                <Clock className="w-4 h-4" />
                <span className="text-sm">任务列表</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TabsContent value="status" className="mt-0 h-full">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">服务状态:</span>
                    {status?.enabled ? (
                      <span className="text-sm text-green-600">运行中</span>
                    ) : (
                      <span className="text-sm text-gray-500">已停止</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">任务数量:</span>
                    <span className="text-sm">{status?.jobs ?? 0}</span>
                  </div>
                  {status?.nextWakeAtMs && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">下次执行:</span>
                      <span className="text-sm">
                        {new Date(status.nextWakeAtMs).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="jobs" className="mt-0 h-full">
                <div className="flex justify-end mb-4">
                  <Button size="sm" onClick={handleOpenCreate} disabled={creating}>
                    {creating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    新建任务
                  </Button>
                </div>

                <ScrollArea className="h-[calc(100%-3rem)]">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                  ) : jobs.length === 0 ? (
                    <div className="text-center py-12">
                      <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无定时任务</h3>
                      <p className="text-gray-600 mb-4">点击上方按钮创建你的第一个定时任务</p>
                    </div>
                  ) : (
                    <CronJobsList
                      jobs={jobs}
                      onEdit={handleOpenEdit}
                      onDelete={handleDelete}
                      onRun={handleRun}
                      onToggle={handleToggle}
                    />
                  )}
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={handleFormClose}>
        <DialogContent className="max-w-[48rem] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? "编辑定时任务" : "新建定时任务"}</DialogTitle>
          </DialogHeader>
          <CronJobForm
            job={editingJob}
            onSubmit={editingJob ? (data) => handleUpdate(editingJob.id, data) : handleCreate}
            onCancel={handleFormClose}
            loading={creating}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
