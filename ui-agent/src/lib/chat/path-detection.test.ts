import {
  detectPathCardsFromAssistantMessage,
  parseAgentIdFromSessionKey,
} from "@/lib/chat/path-detection";

describe("path-detection", () => {
  test("extracts and deduplicates relative workspace paths", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "请查看 src/app.ts，然后再看 src/app.ts 和 docs/readme.md",
      { sessionKey: "agent:main:ui-abc", maxPerMessage: 20 },
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      source: "detected-path",
      resolvedPath: "src/app.ts",
      previewable: true,
      kind: "file",
      previewUrl: expect.stringContaining("/files/main/src/app.ts"),
    });
    expect(cards[1]).toMatchObject({
      resolvedPath: "docs/readme.md",
      kind: "file",
    });
  });

  test("extracts windows absolute and unc paths", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "日志在 C:\\Users\\Alice\\repo\\error.log，备份在 \\\\server\\share\\backup.zip",
      { sessionKey: "agent:main:ui-abc" },
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]?.resolvedPath).toBe("C:\\Users\\Alice\\repo\\error.log");
    expect(cards[0]?.previewable).toBe(true);
    expect(cards[1]?.resolvedPath).toBe("\\\\server\\share\\backup.zip");
  });

  test("ignores http and https urls", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "文档链接 https://example.com/a/b.md 和 http://foo.bar/test",
      { sessionKey: "agent:main:ui-abc" },
    );
    expect(cards).toHaveLength(0);
  });

  test("does not treat terminology like Docker/K8s as file path", () => {
    const cards = detectPathCardsFromAssistantMessage("我们讨论 Docker/K8s 的部署策略", {
      sessionKey: "agent:main:ui-abc",
    });
    expect(cards).toHaveLength(0);
  });

  test("does not treat slash command like /approve as a file path", () => {
    const cards = detectPathCardsFromAssistantMessage('"/approve 2095fcd5 allow-once"', {
      sessionKey: "agent:main:ui-abc",
    });
    expect(cards).toHaveLength(0);
  });

  test("does not treat slash skill command as a file path", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "请执行 /markdown-converter 再试 /web-access",
      {
        sessionKey: "agent:main:ui-abc",
      },
    );
    expect(cards).toHaveLength(0);
  });

  test("keeps common root directory path like /tmp", () => {
    const cards = detectPathCardsFromAssistantMessage("请查看 /tmp", {
      sessionKey: "agent:main:ui-abc",
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.resolvedPath).toBe("/tmp");
  });

  test("filters common slash terminology from blacklisted context", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "这部分先讨论 CI/CD、API/SDK 和 Frontend/Backend 的对齐策略",
      { sessionKey: "agent:main:ui-abc" },
    );
    expect(cards).toHaveLength(0);
  });

  test("filters ambiguous slash terms under strategy context", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "迁移方案里我们先统一 GraphQL/gRPC 的策略，不涉及真实文件路径",
      { sessionKey: "agent:main:ui-abc" },
    );
    expect(cards).toHaveLength(0);
  });

  test("applies max per message limit", () => {
    const cards = detectPathCardsFromAssistantMessage("a/1.ts a/2.ts a/3.ts a/4.ts a/5.ts", {
      maxPerMessage: 3,
    });
    expect(cards).toHaveLength(3);
  });

  test("treats trailing slash absolute path as directory", () => {
    const cards = detectPathCardsFromAssistantMessage("/Users/jiangwei/clawd/招标书/", {
      sessionKey: "agent:main:ui-abc",
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      resolvedPath: "/Users/jiangwei/clawd/招标书/",
      kind: "directory",
      previewable: false,
    });
    expect(cards[0]?.type).toBeUndefined();
  });

  test("normalizes workspace-prefixed relative path when workspace is configured", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "详情已保存到 clawd/招标书/黑龙江省第四次全国农业普查遥感测量技术服务_20260403.md",
      {
        sessionKey: "agent:main:ui-abc",
        workspaceDir: "/Users/jiangwei/clawd",
      },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      resolvedPath:
        "/Users/jiangwei/clawd/招标书/黑龙江省第四次全国农业普查遥感测量技术服务_20260403.md",
      previewUrl: expect.stringContaining(
        "/files/main/%E6%8B%9B%E6%A0%87%E4%B9%A6/%E9%BB%91%E9%BE%99%E6%B1%9F%E7%9C%81%E7%AC%AC%E5%9B%9B%E6%AC%A1%E5%85%A8%E5%9B%BD%E5%86%9C%E4%B8%9A%E6%99%AE%E6%9F%A5%E9%81%A5%E6%84%9F%E6%B5%8B%E9%87%8F%E6%8A%80%E6%9C%AF%E6%9C%8D%E5%8A%A1_20260403.md",
      ),
    });
  });

  test("extracts markdown link path with spaces", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "请查看 [结果文档](clawd/招标书/黑龙江 省 农普 报告.md)",
      {
        sessionKey: "agent:main:ui-abc",
        workspaceDir: "/Users/jiangwei/clawd",
      },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      resolvedPath: "/Users/jiangwei/clawd/招标书/黑龙江 省 农普 报告.md",
      kind: "file",
    });
  });

  test("extracts inline code path with spaces", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "请预览 `/Users/jiangwei/clawd/My Project/report final.md`",
      { sessionKey: "agent:main:ui-abc" },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.resolvedPath).toBe("/Users/jiangwei/clawd/My Project/report final.md");
  });

  test("extracts path from fenced code block", () => {
    const cards = detectPathCardsFromAssistantMessage(
      ["执行命令：", "```bash", "cat /Users/jiangwei/clawd/logs/agent.log", "```"].join("\n"),
      { sessionKey: "agent:main:ui-abc" },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.resolvedPath).toBe("/Users/jiangwei/clawd/logs/agent.log");
  });

  test("keeps path token when followed by inline annotation", () => {
    const cards = detectPathCardsFromAssistantMessage(
      "日志已经写入 logs/app.log（追加式日志）请继续分析",
      { sessionKey: "agent:main:ui-abc" },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      resolvedPath: "logs/app.log",
      kind: "file",
    });
  });

  test("rejects unrealistic path segments with illegal characters", () => {
    const cards = detectPathCardsFromAssistantMessage("请检查 src/<bad>.ts", {
      sessionKey: "agent:main:ui-abc",
    });
    expect(cards).toHaveLength(0);
  });

  test("parses agent id from session key", () => {
    expect(parseAgentIdFromSessionKey("agent:research:ui-123")).toBe("research");
    expect(parseAgentIdFromSessionKey("invalid")).toBe("main");
    expect(parseAgentIdFromSessionKey(undefined)).toBe("main");
  });
});
