import { describe, expect, it } from "vitest";
import { mergeSessionDocumentsForBind } from "./index.js";
import type { SessionDocumentMeta } from "./types.js";

function createDoc(params: {
  documentId: string;
  knowledgeDocumentId?: string;
  filename: string;
}): SessionDocumentMeta {
  return {
    documentId: params.documentId,
    knowledgeDocumentId: params.knowledgeDocumentId,
    kbId: "kb-default",
    filename: params.filename,
    mimeType: "application/pdf",
    indexPath: null,
    builtAt: Date.now(),
  };
}

describe("mergeSessionDocumentsForBind", () => {
  it("moves non-duplicate docs and skips duplicates by knowledgeDocumentId", () => {
    const target = [
      createDoc({
        documentId: "doc-target-1",
        knowledgeDocumentId: "kdoc-1",
        filename: "existing.pdf",
      }),
    ];
    const source = [
      createDoc({
        documentId: "doc-source-dup",
        knowledgeDocumentId: "kdoc-1",
        filename: "existing-copy.pdf",
      }),
      createDoc({
        documentId: "doc-source-new",
        knowledgeDocumentId: "kdoc-2",
        filename: "new.pdf",
      }),
    ];

    const result = mergeSessionDocumentsForBind({
      sourceDocuments: source,
      targetDocuments: target,
    });

    expect(result.moved).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.documents.map((doc) => doc.documentId)).toEqual([
      "doc-target-1",
      "doc-source-new",
    ]);
  });
});
