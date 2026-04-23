import { stripCliBindingMetadata } from "@/lib/chat/cli-binding";

const ATTACHMENT_MARKER_RE = /^\[Attachment\s+\d+\]\s+.+$/gim;
const EXEC_APPROVAL_FOLLOWUP_HEADER_RE =
  /^(?:An async command the user already approved has completed\.|An async command did not run\.)$/;
const EXEC_APPROVAL_DETAILS_MARKER = "Exact completion details:";
const EXEC_APPROVAL_REPLY_MARKER = "Reply to the user in a helpful way.";
const HEARTBEAT_PROMPT_RE = /read heartbeat\.md if it exists/i;
const HEARTBEAT_HINT_RE = /when reading heartbeat\.md,\s*use workspace file/i;
const SYSTEM_EVENT_LINE_RE = /^\s*System(?: \(untrusted\))?:/im;
const CURRENT_TIME_LINE_RE = /^\s*Current time:/im;

function collapseRepeatedWholeMessage(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  let current = normalized.trim();
  let changed = false;

  const repeatedParagraphs = current
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    repeatedParagraphs.length >= 2 &&
    repeatedParagraphs.every((part) => part === repeatedParagraphs[0])
  ) {
    return repeatedParagraphs[0];
  }

  while (current) {
    let collapsed: string | null = null;
    for (let index = 1; index < current.length; index += 1) {
      if (current[index] !== "\n") {
        continue;
      }
      const left = current.slice(0, index).trim();
      const right = current.slice(index + 1).trim();
      if (!left || !right) {
        continue;
      }
      if (left === right) {
        collapsed = left;
        break;
      }
    }
    if (!collapsed) {
      break;
    }
    current = collapsed;
    changed = true;
  }

  return changed ? current : text;
}

function isInternalHeartbeatPrompt(text: string): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.replace(/\r\n/g, "\n");
  const hasHeartbeatInstruction =
    HEARTBEAT_PROMPT_RE.test(normalized) || HEARTBEAT_HINT_RE.test(normalized);
  if (!hasHeartbeatInstruction) {
    return false;
  }
  return SYSTEM_EVENT_LINE_RE.test(normalized) || CURRENT_TIME_LINE_RE.test(normalized);
}

export function extractExecApprovalFollowupResultText(text: string): string | null {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);
  if (!EXEC_APPROVAL_FOLLOWUP_HEADER_RE.test(lines[0] ?? "")) {
    return null;
  }

  const detailsIndex = lines.findIndex((line) => line.trim() === EXEC_APPROVAL_DETAILS_MARKER);
  if (detailsIndex < 0) {
    return null;
  }
  const replyIndex = lines.findIndex(
    (line, index) => index > detailsIndex && line.trim() === EXEC_APPROVAL_REPLY_MARKER,
  );
  if (replyIndex < 0) {
    return null;
  }

  const details = lines
    .slice(detailsIndex + 1, replyIndex)
    .join("\n")
    .trim();
  return details || null;
}

export function sanitizeVisibleMessageText(
  text: string,
  role: "user" | "assistant",
): { text: string; hidden: boolean } {
  if (role === "user" && isInternalHeartbeatPrompt(text)) {
    return { text: "", hidden: true };
  }
  const followupResult = extractExecApprovalFollowupResultText(text);
  if (!followupResult) {
    return { text: collapseRepeatedWholeMessage(text), hidden: false };
  }
  if (role === "user") {
    return { text: "", hidden: true };
  }
  return { text: collapseRepeatedWholeMessage(followupResult), hidden: false };
}

export function normalizeMessageContentForMatching(content: string): string {
  const followupResult = extractExecApprovalFollowupResultText(content);
  const stripped = collapseRepeatedWholeMessage(
    stripCliBindingMetadata(followupResult ?? content)
      .replace(ATTACHMENT_MARKER_RE, "")
      .trim(),
  );
  return stripped.replace(/\s+/g, " ");
}
