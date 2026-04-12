import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  resetSharedApprovalStateForTests,
  setSharedApprovalStale,
  setSharedApprovalSubmitted,
} from "@/lib/approval-state";
import { useConnectionStore } from "@/stores/connectionStore";

jest.mock("@/components/agent/FormattedContent", () => ({
  FormattedContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock("@/components/chat/CitationBlock", () => ({
  CitationBlock: () => null,
}));

jest.mock("@/components/files/FileList", () => ({
  FileList: ({
    files,
    onPreviewFile,
  }: {
    files?: Array<unknown>;
    onPreviewFile?: (file: unknown) => void;
  }) =>
    files && files.length > 0 && onPreviewFile ? (
      <button type="button" onClick={() => onPreviewFile(files[0])}>
        mock-preview-file
      </button>
    ) : null,
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
    resetSharedApprovalStateForTests();
    (
      useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      }
    ).getState = jest.fn(() => ({ wsClient: undefined }));
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
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
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
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
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
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

    expect(screen.queryByText("/approve 2095fcd5 allow-once")).not.toBeInTheDocument();

    const allowOnceButton = screen.getByRole("button", { name: "本次同意" });
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
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
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

  test("shows approval action summary before confirmation details", () => {
    render(
      <MessageBubble
        role="assistant"
        messageId="assistant-live-1"
        content={
          "需要你批准一下这个操作：\n/approve 19209b96 allow-once|allow-always|deny\n这是检查浏览器 CDP 依赖的工具脚本。"
        }
      />,
    );

    expect(screen.getByText("待您确认")).toBeInTheDocument();
    expect(screen.getByText(/请求操作：/)).toBeInTheDocument();
    expect(screen.getByText("这是检查浏览器 CDP 依赖的工具脚本。")).toBeInTheDocument();
    expect(screen.getByText(/授权范围：/)).toBeInTheDocument();
    expect(screen.getByText("可选“仅本次”或“始终允许”")).toBeInTheDocument();
    expect(screen.getByText(/确认编号：/)).toBeInTheDocument();
    expect(screen.getByText("19209b96")).toBeInTheDocument();
  });

  test("falls back to a generic operation summary when no human-readable description exists", () => {
    render(
      <MessageBubble
        role="assistant"
        messageId="assistant-live-2"
        content={"Approval required. Reply with: /approve 19209b96 allow-always"}
      />,
    );

    expect(screen.getByText(/请求操作：/)).toBeInTheDocument();
    expect(screen.getByText("助手请求执行一项需要确认的操作")).toBeInTheDocument();
  });

  test("auto-approves with allow-always when auto approve switch is enabled", async () => {
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
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

  test("falls back to allow-once when auto approve is enabled but always is unavailable", async () => {
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    render(
      <MessageBubble
        role="assistant"
        content={"需要审批：/approve 27ce7c1c allow-once"}
        autoApproveAlways={true}
      />,
    );

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith("exec.approval.resolve", {
        id: "27ce7c1c",
        decision: "allow-once",
      });
    });
  });

  test("does not auto-submit the same approval twice after remount", async () => {
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    const { unmount } = render(
      <MessageBubble
        role="assistant"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
        autoApproveAlways={true}
      />,
    );

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    unmount();

    render(
      <MessageBubble
        role="assistant"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
        autoApproveAlways={true}
      />,
    );

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledTimes(1);
    });
  });

  test("treats unknown or expired approval id as an already handled terminal state", async () => {
    const sendRequest = jest.fn().mockRejectedValue(new Error("unknown or expired approval id"));
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    const { unmount } = render(
      <MessageBubble
        role="assistant"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
        autoApproveAlways={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("该审批已处理或已过期。")).toBeInTheDocument();
      expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    unmount();

    render(
      <MessageBubble
        role="assistant"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
        autoApproveAlways={true}
      />,
    );

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledTimes(1);
    });
  });

  test("does not auto-submit historical approval records after refresh", async () => {
    const sendRequest = jest.fn().mockResolvedValue({ ok: true });
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );

    render(
      <MessageBubble
        role="assistant"
        messageId="history-1-123"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
        autoApproveAlways={true}
      />,
    );

    expect(screen.getByText("历史确认记录")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "始终同意" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(sendRequest).not.toHaveBeenCalled();
    });
  });

  test("does not show stale errors for historical approval records after refresh", () => {
    setSharedApprovalStale("19209b96", "该审批已处理或已过期。");

    render(
      <MessageBubble
        role="assistant"
        messageId="history-1-123"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
      />,
    );

    expect(screen.getByText("历史确认记录")).toBeInTheDocument();
    expect(screen.queryByText("该审批已处理或已过期。")).not.toBeInTheDocument();
  });

  test("does not show submitted status for historical approval records after refresh", () => {
    setSharedApprovalSubmitted("19209b96", "allow-always");

    render(
      <MessageBubble
        role="assistant"
        messageId="history-1-123"
        content={"Approval required. Reply with: /approve 19209b96 allow-once|allow-always|deny"}
      />,
    );

    expect(screen.getByText("历史确认记录")).toBeInTheDocument();
    expect(screen.queryByText(/已处理：/)).not.toBeInTheDocument();
  });

  test("does not render device pairing approval UI from assistant text", async () => {
    render(
      <MessageBubble
        role="assistant"
        content={"请先处理配对：moltbot devices approve a6e7b317-5f2c-4e69-b7ba-01c4615cbf17"}
      />,
    );

    expect(screen.queryByText("检测到设备配对审批")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "直接批准配对" })).not.toBeInTheDocument();
  });

  test("uses gateway WS preview payload for detected path files instead of HTTP fetch", async () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn();
    const sendRequest = jest.fn().mockImplementation((method: string) => {
      if (method === "agents.files.read") {
        return Promise.resolve({
          agentId: "main",
          workspace: "/workspace/main",
          file: {
            name: "report.md",
            path: "/workspace/main/report.md",
            missing: false,
            size: 17,
            updatedAtMs: 1710000000000,
            mimetype: "text/markdown",
            content: btoa("# Preview content"),
          },
        });
      }
      if (method === "skills.status") {
        return Promise.resolve({ skills: [] });
      }
      return Promise.resolve({});
    });
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: { sendRequest } }),
    );
    (
      useConnectionStore as unknown as jest.Mock & {
        getState?: jest.Mock;
      }
    ).getState = jest.fn(() => ({ wsClient: { sendRequest } }));
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchSpy,
    });

    render(
      <MessageBubble
        role="assistant"
        content="这里是一个相关文件。"
        files={[
          {
            name: "report.md",
            path: "/api/files/agent/report.md",
            source: "detected-path",
            resolvedPath: "/workspace/report.md",
            workspaceRelativePath: "report.md",
            kind: "file",
            previewable: true,
            previewUrl: "/api/files/agent/report.md",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "mock-preview-file" }));

    expect(openSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith("agents.files.read", {
        agentId: "main",
        name: "report.md",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByText("report.md")).toBeInTheDocument();
      expect(screen.getByText("# Preview content")).toBeInTheDocument();
    });

    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: originalFetch,
    });
    openSpy.mockRestore();
  });

  test("renders assistant rich media parts", () => {
    render(
      <MessageBubble
        role="assistant"
        content="[多媒体消息]"
        richParts={[
          {
            type: "image",
            url: "data:image/png;base64,QUJDRA==",
            mimeType: "image/png",
            fileName: "dot.png",
          },
          {
            type: "audio",
            url: "data:audio/mpeg;base64,QUJDRA==",
            mimeType: "audio/mpeg",
            fileName: "voice.mp3",
          },
          {
            type: "file",
            url: "data:text/plain;base64,QUJDRA==",
            mimeType: "text/plain",
            fileName: "notes.txt",
          },
        ]}
      />,
    );

    expect(screen.getByAltText("dot.png")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-audio")).toHaveAttribute(
      "src",
      "data:audio/mpeg;base64,QUJDRA==",
    );
    expect(screen.getByRole("link", { name: "notes.txt" })).toHaveAttribute(
      "href",
      "data:text/plain;base64,QUJDRA==",
    );
  });
});
