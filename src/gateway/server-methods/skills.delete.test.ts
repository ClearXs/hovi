import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfigMock = vi.fn();
const writeConfigFileMock = vi.fn();
const resolveDefaultAgentIdMock = vi.fn(() => "main");
const resolveAgentWorkspaceDirMock = vi.fn(() => "/tmp/workspace");
const buildWorkspaceSkillStatusMock = vi.fn();

vi.mock("../../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
  writeConfigFile: (...args: unknown[]) => writeConfigFileMock(...args),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  listAgentIds: vi.fn(() => ["main"]),
  resolveDefaultAgentId: () => resolveDefaultAgentIdMock(),
  resolveAgentWorkspaceDir: () => resolveAgentWorkspaceDirMock(),
}));

vi.mock("../../agents/skills-status.js", () => ({
  buildWorkspaceSkillStatus: (...args: unknown[]) => buildWorkspaceSkillStatusMock(...args),
}));

vi.mock("../../agents/skills-clawhub.js", () => ({
  installSkillFromClawHub: vi.fn(),
  updateSkillsFromClawHub: vi.fn(),
}));

vi.mock("../../agents/skills-install-clawhub.js", () => ({
  installClawHubSkill: vi.fn(),
}));

vi.mock("../../agents/skills-install.js", () => ({
  installSkill: vi.fn(),
}));

vi.mock("../../agents/skills.js", () => ({
  loadWorkspaceSkillEntries: vi.fn(() => []),
}));

const { skillsHandlers } = await import("./skills.js");

describe("skills.delete", () => {
  let tempRoot: string;
  let managedSkillsDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-delete-"));
    managedSkillsDir = path.join(tempRoot, "managed");
    workspaceDir = path.join(tempRoot, "workspace");
    await fs.mkdir(managedSkillsDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    loadConfigMock.mockReset();
    writeConfigFileMock.mockReset();
    resolveDefaultAgentIdMock.mockReset();
    resolveAgentWorkspaceDirMock.mockReset();
    buildWorkspaceSkillStatusMock.mockReset();

    resolveDefaultAgentIdMock.mockReturnValue("main");
    resolveAgentWorkspaceDirMock.mockReturnValue(workspaceDir);
    loadConfigMock.mockReturnValue({
      skills: {
        entries: {
          ontology: { enabled: true },
          another: { enabled: false },
        },
      },
    });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("removes managed skills and cleans config entries in one request", async () => {
    const ontologyDir = path.join(managedSkillsDir, "ontology");
    await fs.mkdir(ontologyDir, { recursive: true });
    await fs.writeFile(path.join(ontologyDir, "SKILL.md"), "# ontology\n", "utf8");

    buildWorkspaceSkillStatusMock.mockReturnValue({
      workspaceDir,
      managedSkillsDir,
      skills: [
        {
          skillKey: "ontology",
          source: "openclaw-managed",
          baseDir: ontologyDir,
        },
      ],
    });

    let ok: boolean | null = null;
    let response: unknown;
    let error: { message?: string } | undefined;
    await skillsHandlers["skills.delete"]({
      params: {
        skillKeys: ["ontology"],
      },
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (success, result, err) => {
        ok = success;
        response = result;
        error = err as { message?: string } | undefined;
      },
    });

    expect(ok).toBe(true);
    expect(error).toBeUndefined();
    expect(response).toMatchObject({
      ok: true,
      removed: 1,
      results: [{ skillKey: "ontology", ok: true }],
    });

    await expect(fs.stat(ontologyDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(writeConfigFileMock).toHaveBeenCalledTimes(1);
    expect(writeConfigFileMock.mock.calls[0]?.[0]).toMatchObject({
      skills: {
        entries: {
          another: { enabled: false },
        },
      },
    });
  });

  it("rejects deleting non-managed sources", async () => {
    const workspaceSkillDir = path.join(workspaceDir, "skills", "local");
    await fs.mkdir(workspaceSkillDir, { recursive: true });
    await fs.writeFile(path.join(workspaceSkillDir, "SKILL.md"), "# local\n", "utf8");

    buildWorkspaceSkillStatusMock.mockReturnValue({
      workspaceDir,
      managedSkillsDir,
      skills: [
        {
          skillKey: "local",
          source: "openclaw-workspace",
          baseDir: workspaceSkillDir,
        },
      ],
    });

    let ok: boolean | null = null;
    let error: { message?: string } | undefined;
    await skillsHandlers["skills.delete"]({
      params: {
        skillKeys: ["local"],
      },
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (success, _result, err) => {
        ok = success;
        error = err as { message?: string } | undefined;
      },
    });

    expect(ok).toBe(false);
    expect(error?.message).toContain('source "openclaw-workspace" is not removable');
    expect(writeConfigFileMock).not.toHaveBeenCalled();
    await expect(fs.stat(workspaceSkillDir)).resolves.toBeTruthy();
  });
});
