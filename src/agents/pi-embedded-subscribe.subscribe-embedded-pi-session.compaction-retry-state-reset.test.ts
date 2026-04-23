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

describe("resetForCompactionRetry — state reset completeness", () => {
  it("emits one block reply after compaction retry, not two (no duplicate from stale state)", async () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedHarness({
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    // Simulate: first message → compaction triggered → retry → second message
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "First response" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    emitMessageStartAndEndForAssistantText({ emit, text: "First response" });

    // Simulate auto_compaction_start and end with willRetry=true
    emit({ type: "auto_compaction_start" });
    emit({ type: "auto_compaction_end", willRetry: true });

    // Retry: new message
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "Second response after retry" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    emitMessageStartAndEndForAssistantText({ emit, text: "Second response after retry" });
    emit({ type: "agent_end" });

    await flushMicrotasks();

    // Should be exactly 2 calls (one per message), not more
    expect(onBlockReply).toHaveBeenCalledTimes(2);
    expect(onBlockReply.mock.calls[0][0].text).toBe("First response");
    expect(onBlockReply.mock.calls[1][0].text).toBe("Second response after retry");
  });

  it("emits exactly one block reply after compaction retry when first message had no visible content", async () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedHarness({
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
      // Note: enforceFinalTag=true requires <final> tags in message.content to preserve
      // text at message_end. Without them, stripBlockTags returns "". We test the
      // non-enforceFinalTag path here since that's the typical compaction scenario.
    });

    // First message: only thinking (no final output)
    // text_delta: thinking content stripped → empty chunk → nothing pushed
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "<think> lots of reasoning but no final" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    const emptyMessage = {
      role: "assistant",
      stopReason: "end_turn",
      content: [{ type: "text", text: "" }],
    } as AssistantMessage;
    emit({ type: "message_end", message: emptyMessage });
    // → cleanedText="", trimmedText="", first guard (cleanedText||hasMedia) → false, returns early

    emit({ type: "auto_compaction_start" });
    emit({ type: "auto_compaction_end", willRetry: true });
    // → resetForCompactionRetry() resets emittedAssistantUpdate=false

    // Retry: second message with actual output
    // text_delta: thinking content stripped → empty chunk
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "<think> reasoning part" },
    });
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_end" },
    });
    // emitMessageStartAndEndForAssistantText sends message_start (resets emittedAssistantUpdate=false)
    // then message_end with content: [{type:"text", text:"Actual response"}]
    emitMessageStartAndEndForAssistantText({ emit, text: "Actual response" });
    emit({ type: "agent_end" });
    // → message_end: extractAssistantText → "Actual response", emittedAssistantUpdate=false
    //   → streaming path emits (sets emittedAssistantUpdate=true, suppressBlockChunks=true)
    //   → message_end path: addedDuringMessage=true, skips pushAssistantText
    //   → emitSplitResultAsBlockReply: skipped because suppressBlockChunks=true

    await flushMicrotasks();

    // Only 1 call from the streaming path (the text_delta for "Actual response" pushes to
    // assistantTexts → suppressBlockChunks=true → message_end skips duplicate emission)
    expect(onBlockReply).toHaveBeenCalledTimes(1);
    expect(onBlockReply.mock.calls[0][0].text).toBe("Actual response");
  });

  // Note: double message_end is already guarded by emittedAssistantUpdate reset on message_start.
  // handleMessageStart resets emittedAssistantUpdate to false, so any message_end
  // will re-trigger emission. This is existing behavior tested elsewhere.
});
