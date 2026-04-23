import { buildSessionMessageFromTranscriptEvent } from "@/lib/chat/session-message";

const defaultExtractMessageText = (content: unknown): string => {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .map((part) =>
      part &&
      typeof part === "object" &&
      "text" in part &&
      typeof (part as { text?: string }).text === "string"
        ? (part as { text?: string }).text
        : "",
    )
    .join("\n");
};

describe("session-message", () => {
  test("drops internal heartbeat user prompts from transcript events", () => {
    const result = buildSessionMessageFromTranscriptEvent({
      payload: {
        sessionKey: "agent:main:ui-1",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "System: [2026-04-15 11:22:32 GMT+8] Exec completed (tidy-sag, code 9) :: unzip: cannot find or open ../source/Bob.app.zip",
                "",
                "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.",
                "When reading HEARTBEAT.md, use workspace file /Users/demo/clawd/HEARTBEAT.md (exact case). Do not read docs/heartbeat.md.",
                "Current time: Wednesday, April 15th, 2026 - 11:25 (Asia/Shanghai) / 2026-04-15 03:25 UTC",
              ].join("\n"),
            },
          ],
          timestamp: "2026-04-15T03:25:00.000Z",
        },
      },
      extractMessageText: defaultExtractMessageText,
      normalizeUsage: () => undefined,
      detectPathCards: () => [],
    });

    expect(result).toBeNull();
  });

  test("drops internal exec approval follow-up user prompts from transcript events", () => {
    const result = buildSessionMessageFromTranscriptEvent({
      payload: {
        sessionKey: "agent:main:ui-1",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "An async command the user already approved has completed.",
                "Do not run the command again.",
                "",
                "Exact completion details:",
                "Exec finished (gateway id=req-1, code 0)",
                "done",
                "",
                "Reply to the user in a helpful way.",
                "If it succeeded, share the relevant output.",
                "If it failed, explain what went wrong.",
              ].join("\n"),
            },
          ],
          timestamp: "2026-04-15T01:00:00.000Z",
        },
      },
      extractMessageText: defaultExtractMessageText,
      normalizeUsage: () => undefined,
      detectPathCards: () => [],
    });

    expect(result).toBeNull();
  });

  test("drops blank assistant messages with no text and no media parts", () => {
    const result = buildSessionMessageFromTranscriptEvent({
      payload: {
        sessionKey: "agent:main:ui-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "" }],
          timestamp: "2026-04-15T03:25:00.000Z",
        },
      },
      extractMessageText: defaultExtractMessageText,
      normalizeUsage: () => undefined,
      detectPathCards: () => [],
    });

    // Empty assistant message (no text, no media) should be filtered out as a defensive
    // measure against blank bubbles that can arise from compaction retry edge cases.
    expect(result).toBeNull();
  });

  test("drops blank assistant messages with whitespace-only text and no media parts", () => {
    const result = buildSessionMessageFromTranscriptEvent({
      payload: {
        sessionKey: "agent:main:ui-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "   \n\t  " }],
          timestamp: "2026-04-15T03:25:00.000Z",
        },
      },
      extractMessageText: defaultExtractMessageText,
      normalizeUsage: () => undefined,
      detectPathCards: () => [],
    });

    expect(result).toBeNull();
  });

  test("renders assistant messages that have visible text", () => {
    const result = buildSessionMessageFromTranscriptEvent({
      payload: {
        sessionKey: "agent:main:ui-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello world" }],
          timestamp: "2026-04-15T03:25:00.000Z",
        },
      },
      extractMessageText: defaultExtractMessageText,
      normalizeUsage: () => undefined,
      detectPathCards: () => [],
    });

    expect(result).not.toBeNull();
    expect(result!.message.content).toBe("Hello world");
    expect(result!.message.role).toBe("assistant");
  });

  test("renders assistant messages that have media parts even with no text", () => {
    const result = buildSessionMessageFromTranscriptEvent({
      payload: {
        sessionKey: "agent:main:ui-1",
        message: {
          role: "assistant",
          content: [{ type: "image", url: "https://example.com/photo.png" }],
          timestamp: "2026-04-15T03:25:00.000Z",
        },
      },
      extractMessageText: defaultExtractMessageText,
      normalizeUsage: () => undefined,
      detectPathCards: () => [],
    });

    // Media-only messages should NOT be filtered — the image will render via rich parts.
    expect(result).not.toBeNull();
    expect(result!.message.content).toBe("");
  });
});
