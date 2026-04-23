import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  createStubSessionHarness,
  emitMessageStartAndEndForAssistantText,
} from "./pi-embedded-subscribe.e2e-harness.js";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createSubscribedHarness(
  options: Omit<Parameters<typeof subscribeEmbeddedPiSession>[0], "session">,
) {
  const { session, emit } = createStubSessionHarness();
  subscribeEmbeddedPiSession({ session, ...options });
  return { emit };
}

describe("emitBlockChunk — empty content guard", () => {
  it("does not call onBlockReply when delta strips to empty after stripBlockTags", async () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedHarness({
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
      enforceFinalTag: true,
    });

    // Delta that becomes empty after stripBlockTags with enforceFinalTag=true
    // and no actual <final> content
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "<final></final>" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    const assistantMessage = {
      role: "assistant",
      stopReason: "end_turn",
      content: [{ type: "text", text: "" }],
    } as AssistantMessage;
    emit({ type: "message_end", message: assistantMessage });
    await flushMicrotasks();

    expect(onBlockReply).not.toHaveBeenCalled();
  });

  it("does not call onBlockReply when delta is only directive marker with no text", async () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedHarness({
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    // Directive-only text — all stripped by parseReplyDirectives
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "[[some_directive]]" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    const assistantMessage = {
      role: "assistant",
      stopReason: "end_turn",
      content: [{ type: "text", text: "" }],
    } as AssistantMessage;
    emit({ type: "message_end", message: assistantMessage });
    await flushMicrotasks();

    expect(onBlockReply).not.toHaveBeenCalled();
  });

  it("does not call onBlockReply when all text is inside <think> tags with enforceFinalTag=true", async () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedHarness({
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
      enforceFinalTag: true,
    });

    // Text outside <think> is empty; content only inside thinking tags
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "<think> lots of reasoning but no final output",
      },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    const assistantMessage = {
      role: "assistant",
      stopReason: "end_turn",
      content: [{ type: "text", text: "" }],
    } as AssistantMessage;
    emit({ type: "message_end", message: assistantMessage });
    await flushMicrotasks();

    expect(onBlockReply).not.toHaveBeenCalled();
  });

  it("calls onBlockReply with text when chunk has visible content", async () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedHarness({
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "Hello world" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    emitMessageStartAndEndForAssistantText({ emit, text: "Hello world" });
    await flushMicrotasks();

    expect(onBlockReply).toHaveBeenCalledTimes(1);
    expect(onBlockReply.mock.calls[0][0].text).toBe("Hello world");
  });

  // Note: MEDIA: URL emission is covered by existing tests.
  // The test above verifies that empty chunks (no text, no media) don't emit.
});
