import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChannelGrid } from "./ChannelGrid";

describe("ChannelGrid", () => {
  test("opens add-channel wizard and submits create payload", async () => {
    const onCreateChannel = jest.fn().mockResolvedValue(undefined);
    const onOpenConfig = jest.fn();

    render(
      <ChannelGrid
        cards={[]}
        isLoading={false}
        isCreatingChannel={false}
        createError={null}
        createMessage={null}
        onOpenMonitor={jest.fn()}
        onOpenConfig={onOpenConfig}
        onOpenLogs={jest.fn()}
        onCreateChannel={onCreateChannel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增频道" }));
    expect(screen.getByText("新增频道向导")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Telegram/i }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("Bot Token"), { target: { value: "bot-1" } });
    fireEvent.click(screen.getByRole("button", { name: "创建频道" }));

    await waitFor(() =>
      expect(onCreateChannel).toHaveBeenCalledWith({
        channelId: "telegram",
        enabled: true,
        section: {
          botToken: "bot-1",
          dmPolicy: "pairing",
        },
      }),
    );
    expect(onOpenConfig).not.toHaveBeenCalled();
  });

  test("configured channel enters config directly from wizard", async () => {
    const onOpenConfig = jest.fn();

    render(
      <ChannelGrid
        cards={[
          {
            channelId: "telegram",
            label: "Telegram",
            detailLabel: "Telegram Bot",
            configured: true,
            health: "healthy",
            accountTotal: 1,
            accountConnected: 1,
            alertCount: 0,
          },
        ]}
        isLoading={false}
        isCreatingChannel={false}
        createError={null}
        createMessage={null}
        onOpenMonitor={jest.fn()}
        onOpenConfig={onOpenConfig}
        onOpenLogs={jest.fn()}
        onCreateChannel={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增频道" }));
    fireEvent.click(screen.getByRole("button", { name: /Telegram/i }));
    fireEvent.click(screen.getByRole("button", { name: "进入配置" }));

    expect(onOpenConfig).toHaveBeenCalledWith("telegram");
  });

  test("submits form payload for non-specialized channels", async () => {
    const onCreateChannel = jest.fn().mockResolvedValue(undefined);

    render(
      <ChannelGrid
        cards={[]}
        isLoading={false}
        isCreatingChannel={false}
        createError={null}
        createMessage={null}
        onOpenMonitor={jest.fn()}
        onOpenConfig={jest.fn()}
        onOpenLogs={jest.fn()}
        onCreateChannel={onCreateChannel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增频道" }));
    fireEvent.click(screen.getByRole("button", { name: /LINE/i }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("Channel Access Token"), {
      target: { value: "line-token" },
    });
    fireEvent.change(screen.getByLabelText("Channel Secret"), {
      target: { value: "line-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建频道" }));

    await waitFor(() =>
      expect(onCreateChannel).toHaveBeenCalledWith({
        channelId: "line",
        enabled: true,
        section: {
          channelAccessToken: "line-token",
          channelSecret: "line-secret",
        },
      }),
    );
  });
});
