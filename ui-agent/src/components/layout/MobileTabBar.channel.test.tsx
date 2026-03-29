import { fireEvent, render, screen } from "@testing-library/react";
import { MOBILE_EVENTS } from "@/lib/mobileEvents";
import { MobileTabBar } from "./MobileTabBar";

const mockPush = jest.fn();
const mockDispatchMobileEvent = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}));

jest.mock("@/lib/mobileEvents", () => {
  const actual = jest.requireActual("@/lib/mobileEvents");
  return {
    ...actual,
    dispatchMobileEvent: (eventName: string) => mockDispatchMobileEvent(eventName),
  };
});

describe("MobileTabBar channel integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders channel tab and dispatches open-channel event", () => {
    render(<MobileTabBar activeTab="chat" />);

    const channelButton = screen.getByRole("button", { name: "频道" });
    expect(channelButton).toBeInTheDocument();

    fireEvent.click(channelButton);
    expect(mockDispatchMobileEvent).toHaveBeenCalledWith(MOBILE_EVENTS.OPEN_CHANNEL);
  });
});
