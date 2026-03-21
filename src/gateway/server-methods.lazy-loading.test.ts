import { afterEach, describe, expect, it, vi } from "vitest";

const lazyState = vi.hoisted(() => ({
  asrModuleLoads: 0,
}));

vi.mock("../plugins/runtime/gateway-request-scope.js", () => ({
  withPluginRuntimeGatewayRequestScope: async (
    _scope: unknown,
    invoke: () => Promise<void> | void,
  ) => await invoke(),
}));

vi.mock("./server-methods/asr.js", () => {
  lazyState.asrModuleLoads += 1;
  return {
    asrHandlers: {
      "asr.status": ({ respond }: { respond: (ok: boolean, payload?: unknown) => void }) => {
        respond(true, { provider: "mock-asr" });
      },
    },
  };
});

describe("gateway server methods lazy loading", () => {
  afterEach(() => {
    lazyState.asrModuleLoads = 0;
    vi.resetModules();
  });

  it("does not import asr handlers until an asr method is invoked", async () => {
    const { coreGatewayHandlers, handleGatewayRequest } = await import("./server-methods.js");

    expect(lazyState.asrModuleLoads).toBe(0);
    expect(typeof coreGatewayHandlers["asr.status"]).toBe("function");

    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "req-1",
        method: "asr.status",
      },
      client: null,
      context: {} as never,
      isWebchatConnect: () => false,
      respond,
    });

    expect(lazyState.asrModuleLoads).toBe(1);
    expect(respond).toHaveBeenCalledWith(true, { provider: "mock-asr" });
  });
});
