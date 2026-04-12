import { render } from "@testing-library/react";
import MainLayout from "./MainLayout";

const sidebarMock = jest.fn((..._args: unknown[]) => <div data-testid="sidebar" />);

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({ isDesktop: true, isHydrated: true }),
}));

jest.mock("@/components/sidebar/Sidebar", () => ({
  __esModule: true,
  default: (...args: unknown[]) => sidebarMock(...args),
}));

jest.mock("./TopBar", () => ({
  TopBar: () => null,
}));

jest.mock("./MobileTabBar", () => ({
  MobileTabBar: () => null,
}));

jest.mock("./HydrationLoader", () => ({
  HydrationLoader: () => null,
}));

jest.mock("../ui/toast-stack", () => ({
  ToastStack: () => null,
}));

describe("MainLayout sidebar defaults", () => {
  beforeEach(() => {
    sidebarMock.mockClear();
  });

  it("defaults desktop sidebar to collapsed", () => {
    render(<MainLayout assistantVisible={false}>content</MainLayout>);

    expect(sidebarMock).toHaveBeenCalled();
    const calls = sidebarMock.mock.calls;
    const lastProps = calls[calls.length - 1]?.[0] as { isCollapsed?: boolean };
    expect(lastProps?.isCollapsed).toBe(true);
  });
});
