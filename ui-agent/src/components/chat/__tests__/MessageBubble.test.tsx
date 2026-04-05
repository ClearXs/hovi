import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  test("renders approval actions for assistant /approve command and resolves exec approvals", async () => {
    const user = userEvent.setup();
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    render(
      <MessageBubble
        role="assistant"
        content={
          "需要你批准一下这个操作：\n/approve 2095fcd5 allow-once\n这是检查浏览器 CDP 依赖的工具脚本。"
        }
      />,
    );

    const allowOnceButton = screen.getByRole("button", { name: "允许一次" });
    await user.click(allowOnceButton);

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith("exec.approval.resolve", {
        id: "2095fcd5",
        decision: "allow-once",
      });
    });
  });

  test("uses plugin approval RPC for plugin ids", async () => {
    const user = userEvent.setup();
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    render(
      <MessageBubble
        role="assistant"
        content={
          "Approval required. Reply with: /approve plugin:abc123 allow-once|allow-always|deny"
        }
      />,
    );

    const denyButton = screen.getByRole("button", { name: "拒绝" });
    await user.click(denyButton);

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith("plugin.approval.resolve", {
        id: "plugin:abc123",
        decision: "deny",
      });
    });
  });

  test("shows approval title and explains what approval id is for", () => {
    render(<MessageBubble role="assistant" content={"请审批：/approve 19209b96 allow-always"} />);

    expect(screen.getByText("需要您的审批")).toBeInTheDocument();
    expect(screen.getByText(/审批 ID 用于标识本次高权限操作/)).toBeInTheDocument();
    expect(screen.getByText("19209b96")).toBeInTheDocument();
  });

  test("auto-approves with allow-always when auto approve switch is enabled", async () => {
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    render(
      <MessageBubble
        role="assistant"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
        autoApproveAlways={true}
      />,
    );

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith("exec.approval.resolve", {
        id: "19209b96",
        decision: "allow-always",
      });
    });
  });
});
