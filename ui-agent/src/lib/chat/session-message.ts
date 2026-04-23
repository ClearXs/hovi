import type { AssistantRichPart, Message } from "@/components/chat/MessageList";
import type { FileItemProps } from "@/components/files/FileList";
import {
  normalizeMessageContentForMatching,
  sanitizeVisibleMessageText,
} from "@/lib/chat/message-normalization";

type TranscriptPayload = {
  sessionKey?: string;
  messageId?: string;
  messageSeq?: number;
  totalTokens?: number;
  message?: {
    role?: string;
    content?: unknown;
    timestamp?: number | string;
    usage?: unknown;
    __openclaw?: {
      id?: string;
      seq?: number;
    };
  };
};

type DetectPathCardsParams = {
  messageId: string;
  content: string;
  sessionKey: string;
};

type BuildParams = {
  payload: TranscriptPayload;
  extractMessageText: (content: unknown) => string;
  normalizeUsage: (
    usage: unknown,
  ) => { input?: number; output?: number; total?: number } | undefined;
  detectPathCards: (params: DetectPathCardsParams & { content: string }) => FileItemProps[];
};

type SessionMessageResult = {
  sessionKey: string;
  message: Message;
};

const LOCAL_USER_MESSAGE_ID_PREFIX = "msg-";
const LIVE_ASSISTANT_MESSAGE_ID_PREFIX = "assistant-";
const MESSAGE_MATCH_WINDOW_MS = 2 * 60 * 1000;

function resolveTimestampMs(timestamp: Date): number | null {
  const value = timestamp.getTime();
  return Number.isFinite(value) ? value : null;
}

function timestampsAreNear(left: Date, right: Date): boolean {
  const leftMs = resolveTimestampMs(left);
  const rightMs = resolveTimestampMs(right);
  if (leftMs == null || rightMs == null) return false;
  return Math.abs(leftMs - rightMs) <= MESSAGE_MATCH_WINDOW_MS;
}

function isLikelyOptimisticUserMessage(message: Message): boolean {
  return message.id.startsWith(LOCAL_USER_MESSAGE_ID_PREFIX) || message.status === "sending";
}

function isLiveAssistantMessage(message: Message): boolean {
  return message.id.startsWith(LIVE_ASSISTANT_MESSAGE_ID_PREFIX);
}

export function buildSessionMessageFromTranscriptEvent(
  params: BuildParams,
): SessionMessageResult | null {
  const { payload, extractMessageText, normalizeUsage, detectPathCards } = params;
  const sessionKey = payload.sessionKey ?? "";
  const content = payload.message?.content;
  const role =
    payload.message?.role === "user" || payload.message?.role === "assistant"
      ? payload.message.role
      : "assistant";
  const visible = sanitizeVisibleMessageText(extractMessageText(content), role);
  if (visible.hidden) {
    return null;
  }
  const text = visible.text;

  // Defensive filter: suppress blank assistant message bubbles that could arise from
  // compaction retry edge cases (e.g. empty content after state reset) or other
  // backend edge cases. A message is suppressed only when it has neither visible
  // text nor any media parts (images, files, audio).
  if (role === "assistant" && !text.trim() && normalizeAssistantRichParts(content).length === 0) {
    return null;
  }

  const timestamp =
    typeof payload.message?.timestamp === "number"
      ? new Date(payload.message.timestamp)
      : typeof payload.message?.timestamp === "string"
        ? new Date(payload.message.timestamp)
        : new Date();

  const usage = payload.message?.usage != null ? normalizeUsage(payload.message.usage) : undefined;

  const messageId =
    payload.messageId ??
    payload.message?.__openclaw?.id ??
    (typeof payload.messageSeq === "number" ? `msg-${payload.messageSeq}` : `msg-${Date.now()}`);
  const files =
    role === "assistant" && text ? detectPathCards({ messageId, content: text, sessionKey }) : [];

  return {
    sessionKey,
    message: {
      id: messageId,
      role,
      content: text,
      timestamp,
      usage,
      files: files.length > 0 ? files : undefined,
    },
  };
}

export function findTranscriptMessageMatchIndex(messages: Message[], message: Message): number {
  const exactIdIndex = messages.findIndex((candidate) => candidate.id === message.id);
  if (exactIdIndex >= 0) {
    return exactIdIndex;
  }

  const targetContent = normalizeMessageContentForMatching(message.content);
  let bestIndex = -1;
  let bestScore = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate || candidate.role !== message.role) continue;

    const candidateContent = normalizeMessageContentForMatching(candidate.content);
    const sameContent = targetContent.length > 0 && candidateContent === targetContent;
    const nearTimestamp = timestampsAreNear(candidate.timestamp, message.timestamp);
    let score = -1;

    if (message.role === "user") {
      if (sameContent && isLikelyOptimisticUserMessage(candidate) && nearTimestamp) {
        score = 100;
      } else if (sameContent && isLikelyOptimisticUserMessage(candidate)) {
        score = 90;
      } else if (sameContent && nearTimestamp) {
        score = 80;
      }
    } else {
      const isEmptyWaitingAssistant =
        candidate.status === "waiting" &&
        isLiveAssistantMessage(candidate) &&
        candidateContent.length === 0;
      if (sameContent && isLiveAssistantMessage(candidate)) {
        score = 100;
      } else if (isEmptyWaitingAssistant && nearTimestamp) {
        score = 95;
      } else if (sameContent && nearTimestamp) {
        score = 85;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function normalizeAssistantRichParts(content: unknown): AssistantRichPart[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (part): part is AssistantRichPart =>
      part != null &&
      typeof part === "object" &&
      "type" in part &&
      typeof (part as { type?: unknown }).type === "string" &&
      "url" in part &&
      typeof (part as { url?: unknown }).url === "string",
  );
}

export function summarizeAssistantRichParts(richParts: AssistantRichPart[]): string {
  if (!richParts.length) return "";
  return richParts
    .map((p) => {
      if (p.type === "file") return `[文件: ${p.fileName ?? "未知"}]`;
      if (p.type === "image") return "[图片]";
      if (p.type === "audio") return "[音频]";
      return "";
    })
    .filter(Boolean)
    .join(" ");
}
