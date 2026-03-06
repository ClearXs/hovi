// Cron API service using Gateway client

import type { ClawdbotWebSocketClient } from "@/services/clawdbot-websocket";
import type {
  CronJob,
  CronJobCreate,
  CronJobPatch,
  CronStatus,
  CronListParams,
  CronListResult,
} from "@/types/cron";

/**
 * Get cron service status
 * RPC: cron.status
 */
export async function fetchCronStatus(client: ClawdbotWebSocketClient): Promise<CronStatus> {
  const response = await client.sendRequest<CronStatus>("cron.status", {});
  return response;
}

/**
 * Get list of cron jobs
 * RPC: cron.list
 */
export async function fetchCronJobs(
  client: ClawdbotWebSocketClient,
  params?: CronListParams,
): Promise<CronListResult> {
  const response = await client.sendRequest<CronListResult>(
    "cron.list",
    params as Record<string, unknown>,
  );
  return response;
}

/**
 * Create a new cron job
 * RPC: cron.add
 */
export async function createCronJob(
  client: ClawdbotWebSocketClient,
  job: CronJobCreate,
): Promise<{ ok: boolean; id: string }> {
  return await client.sendRequest("cron.add", job as unknown as Record<string, unknown>);
}

/**
 * Update an existing cron job
 * RPC: cron.update
 */
export async function updateCronJob(
  client: ClawdbotWebSocketClient,
  id: string,
  patch: CronJobPatch,
): Promise<{ ok: boolean }> {
  return await client.sendRequest("cron.update", { id, ...patch } as Record<string, unknown>);
}

/**
 * Delete a cron job
 * RPC: cron.remove
 */
export async function deleteCronJob(
  client: ClawdbotWebSocketClient,
  id: string,
): Promise<{ ok: boolean }> {
  return await client.sendRequest("cron.remove", { id });
}

/**
 * Manually trigger a cron job
 * RPC: cron.run
 */
export async function runCronJob(
  client: ClawdbotWebSocketClient,
  id: string,
  mode?: "due" | "force",
): Promise<{ ok: boolean }> {
  return await client.sendRequest("cron.run", { id, mode });
}

/**
 * Wake cron service
 * RPC: cron.wake
 */
export async function wakeCronJob(
  client: ClawdbotWebSocketClient,
  params: { mode: "now" | "next-heartbeat"; text: string },
): Promise<{ ok: boolean }> {
  return await client.sendRequest("cron.wake", params);
}
