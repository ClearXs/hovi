"use client";

import { CronJob } from "@/types/cron";
import { CronJobItem } from "./CronJobItem";

interface CronJobsListProps {
  jobs: CronJob[];
  onEdit: (job: CronJob) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  onToggle: (job: CronJob) => void;
}

export function CronJobsList({ jobs, onEdit, onDelete, onRun, onToggle }: CronJobsListProps) {
  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <CronJobItem
          key={job.id}
          job={job}
          onEdit={() => onEdit(job)}
          onDelete={() => onDelete(job.id)}
          onRun={() => onRun(job.id)}
          onToggle={() => onToggle(job)}
        />
      ))}
    </div>
  );
}
