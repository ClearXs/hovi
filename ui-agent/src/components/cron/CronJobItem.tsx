"use client";

import { Play, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CronJob } from "@/types/cron";

interface CronJobItemProps {
  job: CronJob;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
  onToggle: () => void;
}

export function CronJobItem({ job, onEdit, onDelete, onRun, onToggle }: CronJobItemProps) {
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      await onRun();
    } finally {
      setRunning(false);
    }
  };

  // Format next run time
  const formatNextRun = (ms: number | undefined) => {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format schedule
  const formatSchedule = () => {
    const schedule = job.schedule;
    if (schedule.kind === "at") {
      return schedule.at;
    }
    if (schedule.kind === "every") {
      const ms = schedule.everyMs;
      if (ms < 60000) return `${ms}ms`;
      if (ms < 3600000) return `${ms / 60000}分钟`;
      if (ms < 86400000) return `${ms / 3600000}小时`;
      return `${ms / 86400000}天`;
    }
    if (schedule.kind === "cron") {
      return schedule.expr;
    }
    return "未知";
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2 h-2 rounded-full ${job.enabled ? "bg-green-500" : "bg-gray-300"}`}
            />
            <h3 className="font-semibold text-gray-900">{job.name}</h3>
          </div>
          {job.description && <p className="text-sm text-gray-500 mb-2">{job.description}</p>}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>调度: {formatSchedule()}</span>
            <span>下次: {formatNextRun(job.state.nextRunAtMs)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRun}
            disabled={running || !job.enabled}
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onToggle}>
                {job.enabled ? "禁用" : "启用"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>编辑</DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
