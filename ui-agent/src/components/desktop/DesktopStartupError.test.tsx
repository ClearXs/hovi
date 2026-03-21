import { render, screen } from "@testing-library/react";
import { DesktopStartupError } from "./DesktopStartupError";

describe("DesktopStartupError", () => {
  it("wraps long error text so Windows details stay readable", () => {
    render(<DesktopStartupError error={"very long error message"} onRetry={() => {}} />);

    expect(screen.getByText("very long error message").tagName).toBe("PRE");
    expect(screen.getByText("very long error message")).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByText("very long error message")).toHaveClass("break-all");
  });
});
