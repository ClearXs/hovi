import { loadConfig, writeConfigFile } from "../../config/config.js";
import {
  fetchClawHubPackageDetail,
  fetchClawHubPackageVersion,
  searchClawHubPackages,
} from "../../infra/clawhub.js";
import { installPluginFromClawHub } from "../../plugins/clawhub.js";
import { enablePluginInConfig } from "../../plugins/enable.js";
import { installPluginFromPath } from "../../plugins/install.js";
import { recordPluginInstall } from "../../plugins/installs.js";
import { buildPluginInspectReport, buildPluginStatusReport } from "../../plugins/status.js";
import { setPluginEnabledInConfig } from "../../plugins/toggle-config.js";
import { uninstallPlugin } from "../../plugins/uninstall.js";
import { updateNpmInstalledPlugins } from "../../plugins/update.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readRequiredString(
  value: unknown,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: `${label} is required` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} is required` };
  }
  return { ok: true, value: trimmed };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function summarizeBatch(results: Array<{ ok: boolean }>) {
  const total = results.length;
  const success = results.filter((result) => result.ok).length;
  const failed = total - success;
  return { total, success, failed };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const pluginsHandlers: GatewayRequestHandlers = {
  "plugins.status": ({ respond }) => {
    const cfg = loadConfig();
    const report = buildPluginStatusReport({ config: cfg });
    respond(true, report, undefined);
  },

  "plugins.inspect": ({ params, respond }) => {
    const pluginIdResult = readRequiredString(
      params.pluginId ?? params.id,
      "plugins.inspect requires pluginId",
    );
    if (!pluginIdResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, pluginIdResult.error));
      return;
    }
    const cfg = loadConfig();
    const report = buildPluginStatusReport({ config: cfg });
    const inspect = buildPluginInspectReport({
      id: pluginIdResult.value,
      config: cfg,
      report,
    });
    if (!inspect) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `plugin not found: ${pluginIdResult.value}`),
      );
      return;
    }
    respond(true, inspect, undefined);
  },

  "plugins.toggle": async ({ params, respond }) => {
    const pluginIdResult = readRequiredString(params.pluginId, "pluginId");
    if (!pluginIdResult.ok || typeof params.enabled !== "boolean") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "plugins.toggle requires pluginId and enabled"),
      );
      return;
    }
    const cfg = loadConfig();
    const nextConfig = setPluginEnabledInConfig(cfg, pluginIdResult.value, params.enabled);
    await writeConfigFile(nextConfig);
    respond(
      true,
      {
        ok: true,
        pluginId: pluginIdResult.value,
        enabled: params.enabled,
      },
      undefined,
    );
  },

  "plugins.install": async ({ params, respond }) => {
    const sourceRaw =
      typeof params.source === "string"
        ? params.source
        : typeof params.spec === "string" && params.spec.trim().startsWith("clawhub:")
          ? "clawhub"
          : "path";
    const source = sourceRaw.trim().toLowerCase();
    const forceUnsafe = Boolean(params.dangerouslyForceUnsafeInstall);

    if (source === "path") {
      const pathResult = readRequiredString(params.path, "path");
      if (!pathResult.ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, pathResult.error));
        return;
      }
      const installResult = await installPluginFromPath({
        path: pathResult.value,
        dangerouslyForceUnsafeInstall: forceUnsafe,
      });
      if (!installResult.ok) {
        respond(false, installResult, errorShape(ErrorCodes.UNAVAILABLE, installResult.error));
        return;
      }
      const cfg = loadConfig();
      let nextConfig = enablePluginInConfig(cfg, installResult.pluginId).config;
      nextConfig = recordPluginInstall(nextConfig, {
        pluginId: installResult.pluginId,
        source: "path",
        sourcePath: pathResult.value,
        installPath: installResult.targetDir,
        version: installResult.version,
      });
      await writeConfigFile(nextConfig);
      respond(
        true,
        {
          ok: true,
          source: "path",
          pluginId: installResult.pluginId,
          targetDir: installResult.targetDir,
          version: installResult.version,
        },
        undefined,
      );
      return;
    }

    if (source !== "clawhub") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `unsupported plugins.install source: ${sourceRaw || "(empty)"}`,
        ),
      );
      return;
    }

    const specResult = readRequiredString(params.spec, "spec");
    if (!specResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, specResult.error));
      return;
    }
    const installResult = await installPluginFromClawHub({
      spec: specResult.value,
      dangerouslyForceUnsafeInstall: forceUnsafe,
    });
    if (!installResult.ok) {
      respond(false, installResult, errorShape(ErrorCodes.UNAVAILABLE, installResult.error));
      return;
    }

    const cfg = loadConfig();
    let nextConfig = enablePluginInConfig(cfg, installResult.pluginId).config;
    nextConfig = recordPluginInstall(nextConfig, {
      pluginId: installResult.pluginId,
      source: "clawhub",
      spec: specResult.value,
      installPath: installResult.targetDir,
      version: installResult.version,
      integrity: installResult.clawhub.integrity,
      resolvedAt: installResult.clawhub.resolvedAt,
      clawhubUrl: installResult.clawhub.clawhubUrl,
      clawhubPackage: installResult.clawhub.clawhubPackage,
      clawhubFamily: installResult.clawhub.clawhubFamily,
      clawhubChannel: installResult.clawhub.clawhubChannel,
    });
    await writeConfigFile(nextConfig);

    respond(
      true,
      {
        ok: true,
        source: "clawhub",
        pluginId: installResult.pluginId,
        targetDir: installResult.targetDir,
        version: installResult.version,
        clawhub: installResult.clawhub,
      },
      undefined,
    );
  },

  "plugins.update": async ({ params, respond }) => {
    const pluginId =
      typeof params.pluginId === "string" && params.pluginId.trim()
        ? params.pluginId.trim()
        : undefined;
    const all = params.all === true;
    if (!all && !pluginId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, 'plugins.update requires "pluginId" or "all"'),
      );
      return;
    }
    const cfg = loadConfig();
    const result = await updateNpmInstalledPlugins({
      config: cfg,
      ...(all ? {} : { pluginIds: [pluginId as string] }),
    });
    if (result.changed) {
      await writeConfigFile(result.config);
    }
    const hasError = result.outcomes.some((entry) => entry.status === "error");
    respond(
      !hasError,
      {
        ok: !hasError,
        ...result,
      },
      hasError
        ? errorShape(ErrorCodes.UNAVAILABLE, "one or more plugins failed to update")
        : undefined,
    );
  },

  "plugins.uninstall": async ({ params, respond }) => {
    const pluginIdResult = readRequiredString(params.pluginId, "pluginId");
    if (!pluginIdResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, pluginIdResult.error));
      return;
    }
    const deleteFiles = params.deleteFiles !== false;
    const cfg = loadConfig();
    const report = buildPluginStatusReport({ config: cfg });
    const matchedPlugin = report.plugins.find(
      (plugin) => plugin.id === pluginIdResult.value || plugin.name === pluginIdResult.value,
    );
    const resolvedPluginId = matchedPlugin?.id ?? pluginIdResult.value;
    const result = await uninstallPlugin({
      config: cfg,
      pluginId: resolvedPluginId,
      channelIds: matchedPlugin?.channelIds,
      deleteFiles,
    });
    if (!result.ok) {
      respond(false, result, errorShape(ErrorCodes.INVALID_REQUEST, result.error));
      return;
    }
    await writeConfigFile(result.config);
    respond(
      true,
      {
        ok: true,
        pluginId: resolvedPluginId,
        actions: result.actions,
        warnings: result.warnings,
      },
      undefined,
    );
  },

  "plugins.batchToggle": async ({ params, respond }) => {
    const enabled = params.enabled;
    if (typeof enabled !== "boolean") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "plugins.batchToggle requires boolean enabled"),
      );
      return;
    }
    const pluginIds = readStringArray(params.pluginIds);
    if (pluginIds.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "plugins.batchToggle requires pluginIds"),
      );
      return;
    }
    const cfg = loadConfig();
    let nextConfig = cfg;
    const results: Array<{ pluginId: string; ok: boolean; enabled: boolean; reason?: string }> = [];
    for (const pluginId of pluginIds) {
      if (enabled) {
        const toggle = enablePluginInConfig(nextConfig, pluginId);
        nextConfig = toggle.config;
        results.push({
          pluginId,
          ok: toggle.enabled,
          enabled: toggle.enabled,
          ...(toggle.enabled ? {} : { reason: toggle.reason ?? "unable to enable" }),
        });
        continue;
      }
      nextConfig = setPluginEnabledInConfig(nextConfig, pluginId, false);
      results.push({ pluginId, ok: true, enabled: false });
    }
    await writeConfigFile(nextConfig);
    const summary = summarizeBatch(results);
    respond(
      summary.failed === 0,
      {
        ok: summary.failed === 0,
        results,
        summary,
      },
      summary.failed === 0
        ? undefined
        : errorShape(ErrorCodes.UNAVAILABLE, "one or more plugins failed to toggle"),
    );
  },

  "plugins.batchUpdate": async ({ params, respond }) => {
    const all = params.all === true;
    const pluginIds = readStringArray(params.pluginIds);
    if (!all && pluginIds.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, 'plugins.batchUpdate requires "pluginIds" or "all"'),
      );
      return;
    }
    const cfg = loadConfig();
    const result = await updateNpmInstalledPlugins({
      config: cfg,
      ...(all ? {} : { pluginIds }),
    });
    if (result.changed) {
      await writeConfigFile(result.config);
    }
    const summary = summarizeBatch(
      result.outcomes.map((item) => ({ ok: item.status !== "error" })),
    );
    respond(
      summary.failed === 0,
      {
        ok: summary.failed === 0,
        ...result,
        summary,
      },
      summary.failed === 0
        ? undefined
        : errorShape(ErrorCodes.UNAVAILABLE, "one or more plugins failed to update"),
    );
  },

  "plugins.batchUninstall": async ({ params, respond }) => {
    const pluginIds = readStringArray(params.pluginIds);
    if (pluginIds.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "plugins.batchUninstall requires pluginIds"),
      );
      return;
    }
    const deleteFiles = params.deleteFiles !== false;
    const originalConfig = loadConfig();
    const report = buildPluginStatusReport({ config: originalConfig });
    let nextConfig = originalConfig;
    const results: Array<{ pluginId: string; ok: boolean; warnings: string[]; error?: string }> =
      [];
    for (const pluginId of pluginIds) {
      const matchedPlugin = report.plugins.find(
        (entry) => entry.id === pluginId || entry.name === pluginId,
      );
      const resolvedPluginId = matchedPlugin?.id ?? pluginId;
      const result = await uninstallPlugin({
        config: nextConfig,
        pluginId: resolvedPluginId,
        channelIds: matchedPlugin?.channelIds,
        deleteFiles,
      });
      if (!result.ok) {
        results.push({
          pluginId: resolvedPluginId,
          ok: false,
          warnings: [],
          error: result.error,
        });
        continue;
      }
      nextConfig = result.config;
      results.push({
        pluginId: resolvedPluginId,
        ok: true,
        warnings: result.warnings,
      });
    }
    if (nextConfig !== originalConfig) {
      await writeConfigFile(nextConfig);
    }
    const summary = summarizeBatch(results);
    respond(
      summary.failed === 0,
      {
        ok: summary.failed === 0,
        results,
        summary,
      },
      summary.failed === 0
        ? undefined
        : errorShape(ErrorCodes.UNAVAILABLE, "one or more plugins failed to uninstall"),
    );
  },

  "plugins.clawhub.search": async ({ params, respond }) => {
    const queryResult = readRequiredString(params.query, "query");
    if (!queryResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, queryResult.error));
      return;
    }
    const limit =
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined;
    try {
      const results = await searchClawHubPackages({
        query: queryResult.value,
        ...(limit !== undefined ? { limit } : {}),
      });
      const items = results
        .map((entry) => ({
          score: entry.score,
          ...entry.package,
        }))
        .filter((entry) => entry.family === "code-plugin" || entry.family === "bundle-plugin");
      respond(true, { items }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, errorMessage(error)));
    }
  },

  "plugins.clawhub.detail": async ({ params, respond }) => {
    const nameResult = readRequiredString(params.name, "name");
    if (!nameResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, nameResult.error));
      return;
    }
    try {
      const detail = await fetchClawHubPackageDetail({ name: nameResult.value });
      if (!detail.package) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `package not found: ${nameResult.value}`),
        );
        return;
      }
      respond(true, detail, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, errorMessage(error)));
    }
  },

  "plugins.clawhub.version": async ({ params, respond }) => {
    const nameResult = readRequiredString(params.name, "name");
    const versionResult = readRequiredString(params.version, "version");
    if (!nameResult.ok || !versionResult.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "plugins.clawhub.version requires name and version"),
      );
      return;
    }
    try {
      const detail = await fetchClawHubPackageVersion({
        name: nameResult.value,
        version: versionResult.value,
      });
      if (!detail.package || !detail.version) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `version not found: ${nameResult.value}@${versionResult.value}`,
          ),
        );
        return;
      }
      respond(true, detail, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, errorMessage(error)));
    }
  },
};
