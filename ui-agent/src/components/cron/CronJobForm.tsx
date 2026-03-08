"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  CronJob,
  CronJobCreate,
  CronSchedule,
  CronPayload,
  CronDelivery,
  CronFailureAlert,
} from "@/types/cron";

interface CronJobFormProps {
  job?: CronJob | null;
  onSubmit: (data: CronJobCreate) => void;
  onCancel: () => void;
  loading: boolean;
}

type ScheduleKind = "at" | "every" | "cron";

export function CronJobForm({ job, onSubmit, onCancel, loading }: CronJobFormProps) {
  // Basic info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [deleteAfterRun, setDeleteAfterRun] = useState(false);

  // Schedule
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("cron");
  const [atTime, setAtTime] = useState("");
  const [everyMs, setEveryMs] = useState(86400000); // 24 hours default
  const [cronExpr, setCronExpr] = useState("");
  const [tz, setTz] = useState("Asia/Shanghai");

  // Message
  const [message, setMessage] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);

  // Delivery
  const [deliveryMode, setDeliveryMode] = useState<"none" | "announce" | "webhook">("announce");
  const [channel, setChannel] = useState<string>("");
  const [to, setTo] = useState("");

  // Alert
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertAfter, setAlertAfter] = useState(1);
  const [alertChannel, setAlertChannel] = useState<string>("");
  const [alertTo, setAlertTo] = useState("");

  // Initialize form with job data
  useEffect(() => {
    if (job) {
      setName(job.name);
      setDescription(job.description || "");
      setEnabled(job.enabled);
      setDeleteAfterRun(job.deleteAfterRun || false);

      // Schedule
      if (job.schedule.kind === "at") {
        setScheduleKind("at");
        setAtTime(job.schedule.at);
      } else if (job.schedule.kind === "every") {
        setScheduleKind("every");
        setEveryMs(job.schedule.everyMs);
      } else {
        setScheduleKind("cron");
        setCronExpr(job.schedule.expr);
        setTz(job.schedule.tz || "Asia/Shanghai");
      }

      // Message
      if (job.payload.kind === "agentTurn") {
        setMessage(job.payload.message);
        setModel(job.payload.model || "");
        setThinking(job.payload.thinking || "");
        setTimeoutSeconds(job.payload.timeoutSeconds || 300);
      } else if (job.payload.kind === "systemEvent") {
        setMessage(job.payload.text);
      }

      // Delivery
      if (job.delivery) {
        setDeliveryMode(job.delivery.mode);
        setChannel(job.delivery.channel || "");
        setTo(job.delivery.to || "");
      }

      // Alert
      if (job.failureAlert) {
        setAlertEnabled(true);
        setAlertAfter(job.failureAlert.after || 1);
        setAlertChannel(job.failureAlert.channel || "");
        setAlertTo(job.failureAlert.to || "");
      }
    }
  }, [job]);

  const handleSubmit = () => {
    // Build schedule
    let schedule: CronSchedule;
    if (scheduleKind === "at") {
      schedule = { kind: "at", at: atTime };
    } else if (scheduleKind === "every") {
      schedule = { kind: "every", everyMs };
    } else {
      schedule = { kind: "cron", expr: cronExpr, tz };
    }

    // Build payload
    const payload: CronPayload = {
      kind: "agentTurn",
      message,
      model: model || undefined,
      thinking: thinking || undefined,
      timeoutSeconds: timeoutSeconds || undefined,
    };

    // Build delivery
    const delivery: CronDelivery = {
      mode: deliveryMode,
      channel: (channel as any) || undefined,
      to: to || undefined,
    };

    // Build failure alert
    let failureAlert: CronFailureAlert | false = false;
    if (alertEnabled) {
      failureAlert = {
        after: alertAfter,
        channel: (alertChannel as any) || undefined,
        to: alertTo || undefined,
        mode: "announce",
      };
    }

    const data: CronJobCreate = {
      name,
      description: description || undefined,
      enabled,
      deleteAfterRun,
      schedule,
      payload,
      delivery,
      failureAlert,
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="w-full justify-start border-b border-border-light rounded-none p-0 h-auto gap-0 bg-transparent">
          <TabsTrigger
            value="basic"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-sm">基本信息</span>
          </TabsTrigger>
          <TabsTrigger
            value="schedule"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-sm">调度</span>
          </TabsTrigger>
          <TabsTrigger
            value="message"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-sm">消息</span>
          </TabsTrigger>
          <TabsTrigger
            value="delivery"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-sm">投递</span>
          </TabsTrigger>
          <TabsTrigger
            value="alert"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-sm">告警</span>
          </TabsTrigger>
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">名称 *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="我的定时任务"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">描述</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="任务描述..."
              className="mt-1"
            />
          </div>
          <div className="flex items-center justify-between py-2">
            <label className="text-sm font-medium">启用</label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between py-2">
            <label className="text-sm font-medium">任务执行后删除</label>
            <Switch checked={deleteAfterRun} onCheckedChange={setDeleteAfterRun} />
          </div>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">调度方式</label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={scheduleKind === "at" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleKind("at")}
              >
                指定时间
              </Button>
              <Button
                variant={scheduleKind === "every" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleKind("every")}
              >
                间隔
              </Button>
              <Button
                variant={scheduleKind === "cron" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleKind("cron")}
              >
                Cron表达式
              </Button>
            </div>
          </div>

          {scheduleKind === "at" && (
            <div>
              <label className="text-sm font-medium">时间</label>
              <Input
                type="time"
                value={atTime}
                onChange={(e) => setAtTime(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {scheduleKind === "every" && (
            <div>
              <label className="text-sm font-medium">间隔 (毫秒)</label>
              <Input
                type="number"
                value={everyMs}
                onChange={(e) => setEveryMs(Number(e.target.value))}
                placeholder="86400000 (24小时)"
                className="mt-1"
              />
            </div>
          )}

          {scheduleKind === "cron" && (
            <>
              <div>
                <label className="text-sm font-medium">Cron 表达式</label>
                <Input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="0 9 * * * (每天9点)"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">时区</label>
                <Input
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="Asia/Shanghai"
                  className="mt-1"
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* Message Tab */}
        <TabsContent value="message" className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">消息内容 *</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="要发送的消息内容..."
              rows={4}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">模型</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-4-20250514"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Thinking</label>
            <Input
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
              placeholder="low / medium / high"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">超时秒数</label>
            <Input
              type="number"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              placeholder="300"
              className="mt-1"
            />
          </div>
        </TabsContent>

        {/* Delivery Tab */}
        <TabsContent value="delivery" className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">投递模式</label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={deliveryMode === "none" ? "default" : "outline"}
                size="sm"
                onClick={() => setDeliveryMode("none")}
              >
                不投递
              </Button>
              <Button
                variant={deliveryMode === "announce" ? "default" : "outline"}
                size="sm"
                onClick={() => setDeliveryMode("announce")}
              >
                公告
              </Button>
              <Button
                variant={deliveryMode === "webhook" ? "default" : "outline"}
                size="sm"
                onClick={() => setDeliveryMode("webhook")}
              >
                Webhook
              </Button>
            </div>
          </div>

          {deliveryMode !== "none" && (
            <>
              <div>
                <label className="text-sm font-medium">渠道</label>
                <Input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="telegram / whatsapp / discord"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">接收者</label>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="用户ID或群组ID"
                  className="mt-1"
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* Alert Tab */}
        <TabsContent value="alert" className="space-y-4 mt-4">
          <div className="flex items-center justify-between py-2">
            <label className="text-sm font-medium">启用失败告警</label>
            <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
          </div>

          {alertEnabled && (
            <>
              <div>
                <label className="text-sm font-medium">失败次数阈值</label>
                <Input
                  type="number"
                  value={alertAfter}
                  onChange={(e) => setAlertAfter(Number(e.target.value))}
                  placeholder="1"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">告警渠道</label>
                <Input
                  value={alertChannel}
                  onChange={(e) => setAlertChannel(e.target.value)}
                  placeholder="telegram / whatsapp"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">告警接收者</label>
                <Input
                  value={alertTo}
                  onChange={(e) => setAlertTo(e.target.value)}
                  placeholder="用户ID"
                  className="mt-1"
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={loading || !name || !message}>
          {loading ? "保存中..." : job ? "保存" : "创建"}
        </Button>
      </div>
    </div>
  );
}
