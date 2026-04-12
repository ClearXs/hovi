const fetchMock = jest.fn();

describe("mcpso service", () => {
  beforeEach(() => {
    jest.resetModules();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("uses tauri invoke in desktop mode", async () => {
    const invokeMock = jest.fn().mockResolvedValue({
      items: [
        {
          name: "filesystem",
          title: "Filesystem",
        },
      ],
      page: 1,
      hasMore: false,
    });
    (
      window as Window & { __TAURI_INTERNALS__?: { invoke: typeof invokeMock } }
    ).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };

    const { searchMcpSo } = await import("./mcpso");
    const result = await searchMcpSo({ query: "file", page: 1, limit: 20 });

    expect(invokeMock).toHaveBeenCalledWith("mcpso_search", {
      query: "file",
      page: 1,
      limit: 20,
    });
    expect(result.items).toHaveLength(1);
  });

  it("parses search result in browser mode", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `
        <html>
          <body>
            <a href="/server/filesystem/openclaw"></a>
            "name":"filesystem","title":"Filesystem","description":"Browse local files","author_name":"openclaw","url":"https://github.com/openclaw/filesystem"
            "totalPages":2
          </body>
        </html>
      `,
    });

    const { searchMcpSo } = await import("./mcpso");
    const result = await searchMcpSo({ query: "", page: 1, limit: 20 });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        name: "filesystem",
        title: "Filesystem",
        description: "Browse local files",
        authorName: "openclaw",
        repoUrl: "https://github.com/openclaw/filesystem",
        serverPageUrl: "https://mcp.so/server/filesystem/openclaw",
      }),
    );
    expect(result.hasMore).toBe(true);
  });

  it("parses detail and import payload in browser mode", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>Filesystem MCP Server</title>
            <meta name="description" content="Browse local files" />
          </head>
          <body>
            "author_name":"openclaw"
            "url":"https://github.com/openclaw/filesystem"
            "summary":"$summaryRef"
            "content":"$contentRef"
            "server_config":"{\\"mcpServers\\":{\\"filesystem\\":{\\"command\\":\\"npx\\",\\"args\\":[\\"-y\\",\\"@modelcontextprotocol/server-filesystem\\"]}}}"
            summaryRef:T123,Simple summary
            contentRef:T456,Detailed content
          </body>
        </html>
      `,
    });

    const { getMcpSoDetail, importMcpSo } = await import("./mcpso");
    const detail = await getMcpSoDetail("https://mcp.so/server/filesystem/openclaw");
    const imported = await importMcpSo("https://mcp.so/server/filesystem/openclaw");

    expect(detail).toEqual(
      expect.objectContaining({
        title: "Filesystem",
        description: "Browse local files",
        authorName: "openclaw",
        repoUrl: "https://github.com/openclaw/filesystem",
      }),
    );
    expect(imported).toEqual(
      expect.objectContaining({
        name: "Filesystem",
        description: "Browse local files",
        config: expect.objectContaining({
          transport: "stdio",
          command: "npx",
        }),
      }),
    );
  });
});
