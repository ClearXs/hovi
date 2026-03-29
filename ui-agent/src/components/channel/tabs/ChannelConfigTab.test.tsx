import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChannelConfigTab } from "./ChannelConfigTab";

describe("ChannelConfigTab", () => {
  test("renders telegram guided form and updates draft", () => {
    const onDraftChange = jest.fn();
    const onSave = jest.fn();

    render(
      <ChannelConfigTab
        channelId="telegram"
        draft={JSON.stringify(
          { enabled: true, botToken: "old-token", dmPolicy: "pairing" },
          null,
          2,
        )}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage={null}
        probeDetails={[]}
        probeSuggestions={[]}
        onDraftChange={onDraftChange}
        onReload={jest.fn()}
        onSave={onSave}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    expect(screen.getByText("向导模式")).toBeInTheDocument();
    expect(screen.getByLabelText("Bot Token")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Bot Token"), { target: { value: "new-token" } });
    expect(onDraftChange).toHaveBeenCalledWith(expect.stringContaining('"botToken": "new-token"'));
  });

  test("switches to json mode and allows raw editing", () => {
    const onDraftChange = jest.fn();
    const onSave = jest.fn();

    render(
      <ChannelConfigTab
        channelId="discord"
        draft={JSON.stringify(
          { enabled: true, token: "token-1", groupPolicy: "allowlist" },
          null,
          2,
        )}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage={null}
        probeDetails={[]}
        probeSuggestions={[]}
        onDraftChange={onDraftChange}
        onReload={jest.fn()}
        onSave={onSave}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "JSON 模式" }));
    const textarea = screen.getByPlaceholderText('例如：{"enabled": true}');
    fireEvent.change(textarea, { target: { value: '{"enabled":false}' } });
    expect(onDraftChange).toHaveBeenCalledWith('{"enabled":false}');
  });

  test("blocks save in guided mode when required field is missing", () => {
    const onSave = jest.fn();
    render(
      <ChannelConfigTab
        channelId="telegram"
        draft={JSON.stringify({ enabled: true, botToken: "", dmPolicy: "pairing" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage={null}
        probeDetails={[]}
        probeSuggestions={[]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={onSave}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Bot Token 为必填项")).toBeInTheDocument();
  });

  test("calls probe action when clicking probe button", () => {
    const onProbe = jest.fn();
    render(
      <ChannelConfigTab
        channelId="discord"
        draft={JSON.stringify(
          { enabled: true, token: "token-1", groupPolicy: "allowlist" },
          null,
          2,
        )}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage={null}
        probeDetails={[]}
        probeSuggestions={[]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={onProbe}
        onUseTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "连通性探测" }));
    expect(onProbe).toHaveBeenCalled();
  });

  test("shows save success message", () => {
    render(
      <ChannelConfigTab
        channelId="telegram"
        draft={JSON.stringify({ enabled: true, botToken: "token", dmPolicy: "pairing" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage="配置保存成功"
        probeMessage={null}
        probeDetails={[]}
        probeSuggestions={[]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    expect(screen.getByText("配置保存成功")).toBeInTheDocument();
  });

  test("opens probe details dialog when details are available", () => {
    render(
      <ChannelConfigTab
        channelId="telegram"
        draft={JSON.stringify({ enabled: true, botToken: "token", dmPolicy: "pairing" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage="连通性探测完成：未发现在线账号，请检查配置。"
        probeDetails={[
          {
            accountId: "default",
            connected: false,
            configured: true,
            running: false,
            lastError: "token expired",
            reconnectAttempts: 3,
          },
        ]}
        probeSuggestions={[]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看探测详情" }));
    expect(screen.getByText("探测详情")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("token expired")).toBeInTheDocument();
  });

  test("shows probe suggestions when provided", () => {
    render(
      <ChannelConfigTab
        channelId="discord"
        draft={JSON.stringify({ enabled: true, token: "token", groupPolicy: "allowlist" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage="连通性探测完成：未发现在线账号，请检查配置。"
        probeDetails={[]}
        probeSuggestions={[
          "请检查 Discord Bot Token 是否有效。",
          "请确认已开启 Privileged Intents。",
        ]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    expect(screen.getByText("排查建议")).toBeInTheDocument();
    expect(screen.getByText(/Discord Bot Token 是否有效/)).toBeInTheDocument();
    expect(screen.getByText(/Privileged Intents/)).toBeInTheDocument();
  });

  test("jumps to target field when clicking suggestion action", () => {
    render(
      <ChannelConfigTab
        channelId="discord"
        draft={JSON.stringify({ enabled: true, token: "token", groupPolicy: "allowlist" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage="连通性探测完成：未发现在线账号，请检查配置。"
        probeDetails={[]}
        probeSuggestions={["请检查 Discord Bot Token 是否有效。"]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "去配置" }));
    expect(screen.getByLabelText("Bot Token")).toHaveFocus();
  });

  test("groups suggestions by priority sections", () => {
    render(
      <ChannelConfigTab
        channelId="discord"
        draft={JSON.stringify({ enabled: true, token: "token", groupPolicy: "allowlist" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage="连通性探测完成：未发现在线账号，请检查配置。"
        probeDetails={[]}
        probeSuggestions={[
          "请检查 Discord Bot Token 是否有效。",
          "请确认已开启 Privileged Intents。",
          "请在日志页查看最新错误并按错误关键字继续排查。",
        ]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    expect(screen.getByText("阻断项")).toBeInTheDocument();
    expect(screen.getByText("建议项")).toBeInTheDocument();
    expect(screen.getByText(/Discord Bot Token 是否有效/)).toBeInTheDocument();
    expect(screen.getByText(/Privileged Intents/)).toBeInTheDocument();
  });

  test("copies probe checklist text", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <ChannelConfigTab
        channelId="discord"
        draft={JSON.stringify({ enabled: true, token: "token", groupPolicy: "allowlist" }, null, 2)}
        isLoadingConfig={false}
        isSavingConfig={false}
        isProbing={false}
        configError={null}
        saveMessage={null}
        probeMessage="连通性探测完成：未发现在线账号，请检查配置。"
        probeDetails={[]}
        probeSuggestions={[
          "请检查 Discord Bot Token 是否有效。",
          "请确认已开启 Privileged Intents。",
        ]}
        onDraftChange={jest.fn()}
        onReload={jest.fn()}
        onSave={jest.fn()}
        onProbe={jest.fn()}
        onUseTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制排查清单" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Discord Bot Token")),
    );
    await waitFor(() => expect(screen.getByText("已复制排查清单")).toBeInTheDocument());
  });
});
