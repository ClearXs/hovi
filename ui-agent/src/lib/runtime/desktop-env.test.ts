import {
  buildGatewayUrl,
  getConnectorOAuthCallbackUrl,
  getConnectorOAuthCallbackUrlFromLocation,
  getConnectorOAuthMessageOrigins,
  getConnectorOAuthOpenerOriginFromLocation,
  getGatewayHttpBaseUrl,
  getGatewayWsBaseUrl,
  isTauriRuntime,
} from "./desktop-env";

describe("desktop-env", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }

    if (originalWsUrl === undefined) {
      delete process.env.NEXT_PUBLIC_WS_URL;
    } else {
      process.env.NEXT_PUBLIC_WS_URL = originalWsUrl;
    }

    delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    localStorage.clear();
  });

  it("returns loopback gateway urls in desktop mode", () => {
    (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};

    expect(isTauriRuntime()).toBe(true);
    expect(getGatewayHttpBaseUrl()).toBe("http://127.0.0.1:18789");
    expect(getGatewayWsBaseUrl()).toBe("ws://127.0.0.1:18789");
  });

  it("uses configured browser env vars outside tauri", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_WS_URL = "wss://ws.example.com";

    expect(isTauriRuntime()).toBe(false);
    expect(getGatewayHttpBaseUrl()).toBe("https://api.example.com");
    expect(getGatewayWsBaseUrl()).toBe("wss://ws.example.com");
  });

  it("builds absolute gateway urls for static frontend mode", () => {
    (window as Window & { __TAURI__?: object }).__TAURI__ = {};

    expect(buildGatewayUrl("/api/v1/skills")).toBe("http://127.0.0.1:18789/api/v1/skills");
  });

  it("uses same-origin relative paths for browser http requests when env is not configured", () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(getGatewayHttpBaseUrl({ currentUrl: "http://localhost:3002/chat" })).toBe(
      "http://localhost:3002",
    );
    expect(
      buildGatewayUrl("/files/main/workspace/demo.md", {
        currentUrl: "http://localhost:3002/chat",
      }),
    ).toBe("/files/main/workspace/demo.md");
  });

  it("still uses same-origin relative paths for browser http requests with configured gateway", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_WS_URL;
    localStorage.setItem("clawdbot.gateway.url", "ws://127.0.0.1:18789");

    expect(getGatewayHttpBaseUrl({ currentUrl: "http://localhost:3002/chat" })).toBe(
      "http://127.0.0.1:18789",
    );
    expect(
      buildGatewayUrl("/files/main/workspace/demo.md", {
        currentUrl: "http://localhost:3002/chat",
      }),
    ).toBe("/files/main/workspace/demo.md");
  });

  it("uses gateway callback origin for packaged tauri oauth redirects", () => {
    const callbackUrl = getConnectorOAuthCallbackUrl("github", {
      tauri: true,
      currentUrl: "tauri://localhost/",
    });

    expect(callbackUrl).toBe(
      "http://127.0.0.1:18789/oauth/connectors/callback?id=github&openerOrigin=tauri%3A%2F%2Flocalhost",
    );
    expect(
      getConnectorOAuthMessageOrigins({
        tauri: true,
        currentUrl: "tauri://localhost/",
      }),
    ).toEqual(["tauri://localhost", "http://127.0.0.1:18789"]);
  });

  it("preserves callback identity params when resolving from callback location", () => {
    const currentUrl =
      "http://127.0.0.1:18789/oauth/connectors/callback?id=github&openerOrigin=tauri%3A%2F%2Flocalhost&code=abc&state=xyz";

    expect(getConnectorOAuthCallbackUrlFromLocation({ currentUrl })).toBe(
      "http://127.0.0.1:18789/oauth/connectors/callback?id=github&openerOrigin=tauri%3A%2F%2Flocalhost",
    );
    expect(getConnectorOAuthOpenerOriginFromLocation({ currentUrl })).toBe("tauri://localhost");
  });
});
