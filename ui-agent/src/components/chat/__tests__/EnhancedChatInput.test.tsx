import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnhancedChatInput, resolveSlashPanelPlacement } from "@/components/chat/EnhancedChatInput";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";

// Mock dependencies
jest.mock("@/stores/connectionStore", () => ({
  useConnectionStore: jest.fn(() => ({
    connectors: [],
  })),
}));

jest.mock("@/stores/settingsStore", () => ({
  useSettingsStore: jest.fn(() => ({
    settings: {},
  })),
}));

describe("EnhancedChatInput - Quick Actions", () => {
  const mockOnSend = jest.fn();
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeAll(() => {
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        writable: true,
        value: jest.fn(() => "blob:mock"),
      });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        writable: true,
        value: jest.fn(),
      });
    }
  });

  afterAll(() => {
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: originalRevokeObjectURL,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSend.mockResolvedValue({ ok: true });
    (useConnectionStore as jest.Mock).mockImplementation(
      (
        selector: (state: {
          wsClient?: { sendRequest: (...args: unknown[]) => Promise<unknown> };
        }) => unknown,
      ) => selector({ wsClient: undefined }),
    );
    (useSettingsStore as jest.Mock).mockImplementation(
      (selector: (state: { openSettings: (tab: string) => void }) => unknown) =>
        selector({ openSettings: jest.fn() }),
    );
  });

  test("renders quick actions button with Zap icon", () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    expect(quickActionsButton).toBeInTheDocument();
  });

  test("opens dropdown menu when clicking quick actions button", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    expect(screen.getByText("生成文档")).toBeInTheDocument();
    expect(screen.getByText("生成PPT")).toBeInTheDocument();
    expect(screen.getByText("生成Markdown")).toBeInTheDocument();
  });

  test("closes dropdown when clicking outside", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    expect(screen.getByText("生成文档")).toBeInTheDocument();

    // Click outside
    await userEvent.click(document.body);

    expect(screen.queryByText("生成文档")).not.toBeInTheDocument();
  });

  test("selects powerpoint-pptx skill when clicking 生成PPT", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    const pptButton = screen.getByText("生成PPT");
    await userEvent.click(pptButton);

    const input = screen.getByPlaceholderText("输入消息...");
    expect(input).toHaveValue("");
    expect(screen.getByText("/powerpoint-pptx")).toBeInTheDocument();
  });

  test("selects markdown-converter skill when clicking 生成Markdown", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    const markdownButton = screen.getByText("生成Markdown");
    await userEvent.click(markdownButton);

    const input = screen.getByPlaceholderText("输入消息...");
    expect(input).toHaveValue("");
    expect(screen.getByText("/markdown-converter")).toBeInTheDocument();
  });

  test("selects word-generator skill when clicking 生成Word", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    const wordButton = screen.getByText("生成Word");
    await userEvent.click(wordButton);

    const input = screen.getByPlaceholderText("输入消息...");
    expect(input).toHaveValue("");
    expect(screen.getByText("/word-generator")).toBeInTheDocument();
  });

  test("closes dropdown after selecting an option", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    expect(screen.getByText("生成文档")).toBeInTheDocument();

    const pptButton = screen.getByText("生成PPT");
    await userEvent.click(pptButton);

    expect(screen.queryByText("生成文档")).not.toBeInTheDocument();
  });

  test("does not close dropdown when clicking same option twice", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    // First click on PPT
    const pptButton = screen.getByText("生成PPT");
    await userEvent.click(pptButton);

    // Dropdown should close after selection
    expect(screen.queryByText("生成文档")).not.toBeInTheDocument();
  });

  test("button is disabled when input is disabled", () => {
    render(<EnhancedChatInput onSend={mockOnSend} disabled={true} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    expect(quickActionsButton).toBeDisabled();
  });

  test("uses pointer cursor on input action buttons", () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    expect(screen.getByTitle("快捷功能")).toHaveClass("cursor-pointer");
    expect(screen.getByTitle("选择 Skills")).toHaveClass("cursor-pointer");
    expect(screen.getByTitle("选择连接器")).toHaveClass("cursor-pointer");
    expect(screen.getByTitle("@ 提及与 / 命令")).toHaveClass("cursor-pointer");
    expect(screen.getByTitle(/上传文件/)).toHaveClass("cursor-pointer");
    expect(screen.getByTitle(/上传图片/)).toHaveClass("cursor-pointer");
  });

  test("all skill options are visible in dropdown", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const quickActionsButton = screen.getByTitle("快捷功能");
    await userEvent.click(quickActionsButton);

    // Check for PPT option
    expect(screen.getByText("生成PPT")).toBeInTheDocument();

    // Check for Markdown option
    expect(screen.getByText("生成Markdown")).toBeInTheDocument();

    // Check for Word option
    expect(screen.getByText("生成Word")).toBeInTheDocument();
  });

  test("renders auto-approve switch next to send button and toggles callback", async () => {
    const onAutoApproveAlwaysChange = jest.fn();
    render(
      <EnhancedChatInput
        onSend={mockOnSend}
        autoApproveAlways={false}
        onAutoApproveAlwaysChange={onAutoApproveAlwaysChange}
      />,
    );

    const autoApproveSwitch = screen.getByRole("switch", { name: "是否始终允许（免审批）" });
    await userEvent.click(autoApproveSwitch);

    expect(onAutoApproveAlwaysChange).toHaveBeenCalledWith(true);
  });

  test("sends uploaded attachment even before parent draftAttachments rerender", async () => {
    const onDraftAttachmentsChange = jest.fn();
    const { container } = render(
      <EnhancedChatInput
        onSend={mockOnSend}
        draftAttachments={[]}
        onDraftAttachmentsChange={onDraftAttachmentsChange}
      />,
    );

    const imageInput = container.querySelector(
      'input[type="file"][accept="image/*"]',
    ) as HTMLInputElement | null;
    expect(imageInput).not.toBeNull();
    const attachment = new File(["image-content"], "diagram.png", { type: "image/png" });
    fireEvent.change(imageInput!, { target: { files: [attachment] } });

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "请看这张图");
    await userEvent.click(screen.getByTitle("发送 (Shift + Command + Enter)"));

    expect(mockOnSend).toHaveBeenCalledWith("请看这张图", [attachment]);
  });

  test("opens skills selector when typing slash command", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "/");

    expect(screen.getByPlaceholderText("筛选技能...")).toBeInTheDocument();
    const slashPanel = screen.getByTestId("slash-skills-panel");
    expect(slashPanel.className).toContain("absolute");
    expect(slashPanel.className).not.toContain("top-full");
    expect(slashPanel.getAttribute("style")).toContain("top:");
  });

  test("syncs slash token text into skills selector query", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "/mar");

    const skillsQueryInput = screen.getByPlaceholderText("筛选技能...");
    expect(skillsQueryInput).toHaveValue("mar");
  });

  test("insert slash command action opens the same skills selector", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    await userEvent.click(screen.getByTitle("@ 提及与 / 命令"));
    await userEvent.click(screen.getByText("插入 / 命令"));

    const textarea = screen.getByPlaceholderText("输入消息...");
    expect(textarea).toHaveValue("/ ");
    expect(screen.getByPlaceholderText("筛选技能...")).toBeInTheDocument();
    expect(screen.getByTitle("选择 Skills")).toHaveAttribute("data-state", "closed");
  });

  test("highlights selected skill in picker and selected chips area", async () => {
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

    render(<EnhancedChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "/mar");

    const skillButton = await screen.findByTitle("/markdown-converter");
    await userEvent.click(skillButton);

    const selectedChip = screen.getByText("/markdown-converter");
    expect(selectedChip.className).toContain("bg-primary/12");
  });

  test("replaces current slash token when selecting unicode skill from slash panel", async () => {
    const sendRequest = jest.fn().mockResolvedValue({
      skills: [
        {
          skillKey: "投标文件生成器",
          name: "投标文件生成器",
          description: "自动生成投标文件",
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

    render(<EnhancedChatInput onSend={mockOnSend} />);
    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "/");

    const skillButton = await screen.findByTitle("/投标文件生成器");
    await userEvent.click(skillButton);

    expect(textarea).toHaveValue("");
    expect(screen.getAllByText("/投标文件生成器").length).toBeGreaterThan(0);
  });

  test("prefixes selected skills to outgoing user message", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    await userEvent.click(screen.getByTitle("快捷功能"));
    await userEvent.click(screen.getByText("生成Markdown"));

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "请帮我整理");
    await userEvent.click(screen.getByTitle("发送 (Shift + Command + Enter)"));

    expect(mockOnSend).toHaveBeenCalledWith("/markdown-converter 请帮我整理", undefined);
  });

  test("removes selected skill chip when clicking remove button", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    await userEvent.click(screen.getByTitle("快捷功能"));
    await userEvent.click(screen.getByText("生成Markdown"));

    expect(screen.getByText("/markdown-converter")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("移除技能 /markdown-converter"));
    expect(screen.queryByText("/markdown-converter")).not.toBeInTheDocument();
  });

  test("removes last selected skill by Backspace when input is empty", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    await userEvent.click(screen.getByTitle("快捷功能"));
    await userEvent.click(screen.getByText("生成Markdown"));
    await userEvent.click(screen.getByTitle("快捷功能"));
    await userEvent.click(screen.getByText("生成Word"));

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.click(textarea);
    await userEvent.keyboard("{Backspace}");

    expect(screen.queryByText("/word-generator")).not.toBeInTheDocument();
    expect(screen.getByText("/markdown-converter")).toBeInTheDocument();
  });

  test("closes auto-opened skills selector after slash context is removed", async () => {
    render(<EnhancedChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("输入消息...");
    await userEvent.type(textarea, "/abc");
    expect(screen.getByPlaceholderText("筛选技能...")).toBeInTheDocument();

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "普通文本");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("筛选技能...")).not.toBeInTheDocument();
    });
  });

  test("resolves slash panel to open upward when there is not enough space below", () => {
    const placement = resolveSlashPanelPlacement({
      rawTop: 160,
      caretTop: 140,
      panelHeight: 300,
      hostHeight: 200,
      hostTop: 560,
      hostBottom: 760,
      viewportHeight: 800,
    });

    expect(placement.direction).toBe("up");
    expect(placement.top).toBeLessThan(120);
  });

  test("resolves slash panel upward when clipped by an overflow-hidden container", () => {
    const placement = resolveSlashPanelPlacement({
      rawTop: 64,
      caretTop: 44,
      panelHeight: 300,
      hostHeight: 220,
      hostTop: 280,
      hostBottom: 500,
      viewportHeight: 900,
      // Simulate a clipping ancestor bottom lower than window.innerHeight.
      visibleTop: 120,
      visibleBottom: 560,
    });

    expect(placement.direction).toBe("up");
    expect(placement.top).toBeLessThan(0);
  });

  test("resolves slash panel to open downward when there is enough space below", () => {
    const placement = resolveSlashPanelPlacement({
      rawTop: 64,
      caretTop: 44,
      panelHeight: 300,
      hostHeight: 220,
      hostTop: 200,
      hostBottom: 420,
      viewportHeight: 900,
    });

    expect(placement.direction).toBe("down");
    expect(placement.top).toBe(64);
  });
});
