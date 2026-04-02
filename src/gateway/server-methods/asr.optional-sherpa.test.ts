import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../asr/index.js", () => {
  throw Object.assign(new Error("Cannot find package 'onnxruntime-node'"), {
    code: "ERR_MODULE_NOT_FOUND",
  });
});

describe("asr handlers without sherpa runtime", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("still serves config and status for the default cloud provider", async () => {
    const { asrHandlers } = await import("./asr.js");

    let configResult: unknown;
    let statusResult: unknown;

    await (
      asrHandlers["asr.config.get"] as (opts: {
        respond: (ok: boolean, data: unknown) => void;
      }) => Promise<void>
    )({
      respond: (_ok, data) => {
        configResult = data;
      },
    });

    await (
      asrHandlers["asr.status"] as (opts: {
        params: unknown;
        respond: (ok: boolean, data: unknown) => void;
      }) => Promise<void>
    )({
      params: {},
      respond: (_ok, data) => {
        statusResult = data;
      },
    });

    expect(configResult).toMatchObject({
      provider: "deepgram",
    });
    expect(statusResult).toMatchObject({
      provider: "deepgram",
      status: "ready",
    });
  });
});
