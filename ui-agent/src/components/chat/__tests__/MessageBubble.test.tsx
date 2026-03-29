import { render, screen, waitFor } from "@testing-library/react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useConnectionStore } from "@/stores/connectionStore";

jest.mock("@/components/agent/FormattedContent", () => ({
  FormattedContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock("@/components/chat/CitationBlock", () => ({
  CitationBlock: () => null,
}));

jest.mock("@/components/files/FileList", () => ({
  FileList: () => null,
}));

jest.mock("@/contexts/StreamingReplayContext", () => ({
  useStreamingReplay: () => ({
    isStreaming: false,
    getDisplayedText: (_messageIndex: number, _kind: string, content: string) => content,
    currentMessageIndex: 0,
  }),
}));

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({ isMobile: false }),
}));

jest.mock("@/stores/connectionStore", () => ({
  useConnectionStore: jest.fn(),
}));

describe("MessageBubble", () => {
  beforeEach(() => {
    (useConnectionStore as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: undefined }),
    );
  });

  test("only highlights slash tokens that are real skills", async () => {
    const sendRequest = jest.fn().mockResolvedValue({
      skills: [
        {
          skillKey: "markdown-converter",
          name: "Markdown 转换",
          description: "文档转换",
          disabled: false,
          eligible: true,
        },
      ],
    });
    (useConnectionStore as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    render(
      <MessageBubble role="user" content="请执行 /markdown-converter，然后再试 /web-access。" />,
    );

    await waitFor(() => {
      const highlightedTokens = screen.getAllByTestId("skill-token");
      expect(highlightedTokens).toHaveLength(1);
      expect(highlightedTokens[0]).toHaveTextContent("/markdown-converter");
    });
  });
});
