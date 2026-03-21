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

    const config = await (asrHandlers["asr.config.get"] as never)({});
    const status = await (asrHandlers["asr.status"] as never)({ params: {} });

    expect(config).toMatchObject({
      provider: "deepgram",
    });
    expect(status).toMatchObject({
      provider: "deepgram",
      status: "ready",
    });
  });
});
