import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

async function makeTempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    }),
  );
});

async function writeBootstrapFixture(root: string): Promise<string> {
  const source = path.resolve(process.cwd(), "openclaw.mjs");
  const target = path.join(root, "openclaw", "openclaw.mjs");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  await fs.mkdir(path.join(root, "openclaw", "dist"), { recursive: true });
  await fs.writeFile(
    path.join(root, "openclaw", "dist", "warning-filter.js"),
    "export function installProcessWarningFilter() {}\n",
    "utf8",
  );
  return target;
}

describe("openclaw bootstrap", () => {
  it("falls back to a sibling flat entry when nested dist entry is absent", async () => {
    const root = await makeTempRoot("openclaw-bootstrap-");
    const entry = await writeBootstrapFixture(root);
    const markerPath = path.join(root, "marker.txt");

    await fs.writeFile(
      path.join(root, "entry.js"),
      `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(markerPath)}, "ok");\n`,
      "utf8",
    );

    const result = spawnSync(process.execPath, [entry], {
      cwd: path.dirname(entry),
      encoding: "utf8",
      env: { ...process.env, OPENCLAW_NO_RESPAWN: "1", NODE_DISABLE_COMPILE_CACHE: "1" },
    });

    expect(result.status).toBe(0);
    await expect(fs.readFile(markerPath, "utf8")).resolves.toBe("ok");
  });

  it("reports the concrete missing module when an entry dependency is absent", async () => {
    const root = await makeTempRoot("openclaw-bootstrap-missing-");
    const entry = await writeBootstrapFixture(root);

    await fs.writeFile(
      path.join(root, "openclaw", "dist", "entry.js"),
      'import "./missing-chunk.js";\n',
      "utf8",
    );

    const result = spawnSync(process.execPath, [entry], {
      cwd: path.dirname(entry),
      encoding: "utf8",
      env: { ...process.env, OPENCLAW_NO_RESPAWN: "1", NODE_DISABLE_COMPILE_CACHE: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing-chunk.js");
  });
});
