export type ApprovalDecision = "allow-once" | "allow-always" | "deny";

export interface ParsedApprovalCommand {
  id: string;
  decisions: ApprovalDecision[];
}

const APPROVAL_COMMAND_RE =
  /\/?approve(?:@[^\s]+)?\s+([A-Za-z0-9][A-Za-z0-9._:-]*)\s+(allow-once|allow-always|always|deny)\b/gi;
const APPROVAL_TRIPLE_RE =
  /\/?approve(?:@[^\s]+)?\s+([A-Za-z0-9][A-Za-z0-9._:-]*)\s+allow-once\|allow-always\|deny\b/i;

function normalizeDecision(value: string): ApprovalDecision | null {
  const lower = value.trim().toLowerCase();
  if (lower === "allow-once") return "allow-once";
  if (lower === "allow-always" || lower === "always") return "allow-always";
  if (lower === "deny") return "deny";
  return null;
}

function dedupeDecisions(values: ApprovalDecision[]): ApprovalDecision[] {
  const ordered: ApprovalDecision[] = ["allow-once", "allow-always", "deny"];
  const set = new Set(values);
  return ordered.filter((decision) => set.has(decision));
}

export function parseApprovalCommandFromText(content: string): ParsedApprovalCommand | null {
  if (!content.toLowerCase().includes("approve")) {
    return null;
  }

  const tripleMatch = APPROVAL_TRIPLE_RE.exec(content);
  if (tripleMatch && tripleMatch[1]) {
    return {
      id: tripleMatch[1],
      decisions: ["allow-once", "allow-always", "deny"],
    };
  }

  const decisions: ApprovalDecision[] = [];
  let approvalId: string | null = null;
  APPROVAL_COMMAND_RE.lastIndex = 0;
  let match: RegExpExecArray | null = APPROVAL_COMMAND_RE.exec(content);
  while (match) {
    const id = match[1];
    const decision = normalizeDecision(match[2] ?? "");
    if (id && decision) {
      if (approvalId == null) {
        approvalId = id;
      }
      if (approvalId === id) {
        decisions.push(decision);
      }
    }
    match = APPROVAL_COMMAND_RE.exec(content);
  }

  if (!approvalId || decisions.length === 0) {
    return null;
  }

  return {
    id: approvalId,
    decisions: dedupeDecisions(decisions),
  };
}
