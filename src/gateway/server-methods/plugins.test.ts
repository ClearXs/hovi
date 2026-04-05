import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandlerOptions } from "./types.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  writeConfigFile: vi.fn(),
  buildPluginStatusReport: vi.fn(),
  buildPluginInspectReport: vi.fn(),
  enablePluginInConfig: vi.fn(),
  setPluginEnabledInConfig: vi.fn(),
  recordPluginInstall: vi.fn(),
  installPluginFromPath: vi.fn(),
  installPluginFromClawHub: vi.fn(),
  updateNpmInstalledPlugins: vi.fn(),
  uninstallPlugin: vi.fn(),
  searchClawHubPackages: vi.fn(),
  fetchClawHubPackageDetail: vi.fn(),
  fetchClawHubPackageVersion: vi.fn(),
}));

vi.mock("../../config/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js");
  return {
    ...actual,
    loadConfig: mocks.loadConfig,
    writeConfigFile: mocks.writeConfigFile,
  };
});

vi.mock("../../plugins/status.js", () => ({
  buildPluginStatusReport: mocks.buildPluginStatusReport,
  buildPluginInspectReport: mocks.buildPluginInspectReport,
}));

vi.mock("../../plugins/enable.js", () => ({
  enablePluginInConfig: mocks.enablePluginInConfig,
}));

vi.mock("../../plugins/toggle-config.js", () => ({
  setPluginEnabledInConfig: mocks.setPluginEnabledInConfig,
}));

vi.mock("../../plugins/installs.js", () => ({
  recordPluginInstall: mocks.recordPluginInstall,
}));

vi.mock("../../plugins/install.js", () => ({
  installPluginFromPath: mocks.installPluginFromPath,
}));

vi.mock("../../plugins/clawhub.js", () => ({
  installPluginFromClawHub: mocks.installPluginFromClawHub,
}));

vi.mock("../../plugins/update.js", () => ({
  updateNpmInstalledPlugins: mocks.updateNpmInstalledPlugins,
}));

vi.mock("../../plugins/uninstall.js", () => ({
  uninstallPlugin: mocks.uninstallPlugin,
}));

vi.mock("../../infra/clawhub.js", () => ({
  searchClawHubPackages: mocks.searchClawHubPackages,
  fetchClawHubPackageDetail: mocks.fetchClawHubPackageDetail,
  fetchClawHubPackageVersion: mocks.fetchClawHubPackageVersion,
}));

import { pluginsHandlers } from "./plugins.js";

function createOptions(
  method: string,
  params: Record<string, unknown>,
  overrides?: Partial<GatewayRequestHandlerOptions>,
): GatewayRequestHandlerOptions {
  return {
    req: { type: "req", id: "req-1", method, params },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: vi.fn(),
    context: {
      logGateway: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    },
    ...overrides,
  } as unknown as GatewayRequestHandlerOptions;
}

describe("pluginsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue({ plugins: {} });
    mocks.writeConfigFile.mockResolvedValue(undefined);
    mocks.buildPluginStatusReport.mockReturnValue({
      workspaceDir: "/tmp/workspace",
      plugins: [],
      diagnostics: [],
    });
    mocks.buildPluginInspectReport.mockReturnValue({
      plugin: { id: "matrix", name: "Matrix", status: "loaded" },
      capabilities: [],
      diagnostics: [],
    });
    mocks.enablePluginInConfig.mockImplementation((cfg, pluginId) => ({
      config: {
        ...cfg,
        plugins: {
          ...cfg.plugins,
          entries: {
            ...cfg.plugins?.entries,
            [pluginId]: { enabled: true },
          },
        },
      },
      enabled: true,
    }));
    mocks.setPluginEnabledInConfig.mockImplementation((cfg, pluginId, enabled) => ({
      ...cfg,
      plugins: {
        ...cfg.plugins,
        entries: {
          ...cfg.plugins?.entries,
          [pluginId]: { enabled },
        },
      },
    }));
    mocks.recordPluginInstall.mockImplementation((cfg, install) => ({
      ...cfg,
      plugins: {
        ...cfg.plugins,
        installs: {
          ...cfg.plugins?.installs,
          [install.pluginId]: install,
        },
      },
    }));
    mocks.installPluginFromPath.mockResolvedValue({
      ok: true,
      pluginId: "matrix",
      targetDir: "/tmp/ext/matrix",
      version: "1.2.3",
      extensions: ["./dist/index.js"],
    });
    mocks.installPluginFromClawHub.mockResolvedValue({
      ok: true,
      pluginId: "matrix",
      targetDir: "/tmp/ext/matrix",
      version: "1.2.3",
      extensions: ["./dist/index.js"],
      packageName: "matrix",
      clawhub: {
        source: "clawhub",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "matrix",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
        version: "1.2.3",
        integrity: "sha256-demo",
        resolvedAt: "2026-04-02T00:00:00.000Z",
      },
    });
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      config: { plugins: {} },
      changed: true,
      outcomes: [
        {
          pluginId: "matrix",
          status: "updated",
          message: "updated",
        },
      ],
    });
    mocks.uninstallPlugin.mockResolvedValue({
      ok: true,
      config: { plugins: {} },
      pluginId: "matrix",
      actions: {
        entry: true,
        install: true,
        allowlist: false,
        loadPath: false,
        memorySlot: false,
        channelConfig: false,
        directory: true,
      },
      warnings: [],
    });
    mocks.searchClawHubPackages.mockResolvedValue([
      {
        score: 1,
        package: {
          name: "matrix",
          displayName: "Matrix",
          family: "code-plugin",
          channel: "official",
          isOfficial: true,
          createdAt: 1,
          updatedAt: 2,
          latestVersion: "1.2.3",
        },
      },
    ]);
    mocks.fetchClawHubPackageDetail.mockResolvedValue({
      package: {
        name: "matrix",
        displayName: "Matrix",
        family: "code-plugin",
        channel: "official",
        isOfficial: true,
        createdAt: 1,
        updatedAt: 2,
      },
    });
    mocks.fetchClawHubPackageVersion.mockResolvedValue({
      package: { name: "matrix", displayName: "Matrix", family: "code-plugin" },
      version: { version: "1.2.3", createdAt: 1, changelog: "test" },
    });
  });

  it("returns plugin status payload", async () => {
    const opts = createOptions("plugins.status", {});
    await pluginsHandlers["plugins.status"](opts);

    expect(mocks.buildPluginStatusReport).toHaveBeenCalled();
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ workspaceDir: "/tmp/workspace" }),
      undefined,
    );
  });

  it("toggles single plugin enablement", async () => {
    const opts = createOptions("plugins.toggle", { pluginId: "matrix", enabled: false });
    await pluginsHandlers["plugins.toggle"](opts);

    expect(mocks.setPluginEnabledInConfig).toHaveBeenCalledWith(
      expect.any(Object),
      "matrix",
      false,
    );
    expect(mocks.writeConfigFile).toHaveBeenCalled();
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, pluginId: "matrix", enabled: false }),
      undefined,
    );
  });

  it("installs plugin from local path", async () => {
    const opts = createOptions("plugins.install", {
      source: "path",
      path: "/tmp/matrix-plugin",
    });
    await pluginsHandlers["plugins.install"](opts);

    expect(mocks.installPluginFromPath).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/tmp/matrix-plugin" }),
    );
    expect(mocks.writeConfigFile).toHaveBeenCalled();
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, pluginId: "matrix" }),
      undefined,
    );
  });

  it("installs plugin from clawhub spec", async () => {
    const opts = createOptions("plugins.install", {
      source: "clawhub",
      spec: "clawhub:matrix@1.2.3",
    });
    await pluginsHandlers["plugins.install"](opts);

    expect(mocks.installPluginFromClawHub).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "clawhub:matrix@1.2.3" }),
    );
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, pluginId: "matrix" }),
      undefined,
    );
  });

  it("supports batch toggle", async () => {
    const opts = createOptions("plugins.batchToggle", {
      pluginIds: ["matrix", "zalo"],
      enabled: true,
    });
    await pluginsHandlers["plugins.batchToggle"](opts);

    expect(mocks.enablePluginInConfig).toHaveBeenCalledTimes(2);
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        summary: expect.objectContaining({ total: 2, success: 2, failed: 0 }),
      }),
      undefined,
    );
  });

  it("supports clawhub package search for plugins", async () => {
    const opts = createOptions("plugins.clawhub.search", {
      query: "matrix",
      limit: 10,
    });
    await pluginsHandlers["plugins.clawhub.search"](opts);

    expect(mocks.searchClawHubPackages).toHaveBeenCalled();
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ name: "matrix" })]),
      }),
      undefined,
    );
  });
});
