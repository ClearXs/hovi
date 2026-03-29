import { render, screen } from "@testing-library/react";
import { KnowledgeBaseCard } from "./KnowledgeBaseCard";
import { KnowledgeCard } from "./KnowledgeCard";

describe("Knowledge cards cursor", () => {
  it("shows pointer cursor on knowledge base cards", () => {
    render(
      <KnowledgeBaseCard
        kb={{
          kbId: "kb-1",
          name: "产品知识库",
          description: "用于沉淀产品文档",
          icon: "book",
          createdAt: "2026-03-26T00:00:00.000Z",
          updatedAt: "2026-03-26T00:00:00.000Z",
        }}
        onClick={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /产品知识库/ })).toHaveClass("cursor-pointer");
  });

  it("shows pointer cursor on knowledge document cards", () => {
    render(
      <KnowledgeCard
        document={{
          id: "doc-1",
          filename: "需求说明.docx",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 1024,
          uploadedAt: "2026-03-26T00:00:00.000Z",
          indexed: true,
        }}
        onClick={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /需求说明\.docx/ })).toHaveClass("cursor-pointer");
  });
});
