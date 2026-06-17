import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobilePreview from "../MobilePreview";

function activatePreviewMode() {
  // MobilePreview only renders when ?preview=mobile is in the URL.
  window.history.replaceState({}, "", "/?preview=mobile");
}

describe("MobilePreview - keyboard & focus a11y", () => {
  beforeEach(() => activatePreviewMode());

  it("renders all viewport CTAs with accessible names and tap-target size", () => {
    render(<MobilePreview />);
    for (const w of [360, 390, 430]) {
      const btn = screen.getByRole("button", { name: `${w}px` });
      expect(btn).toBeInTheDocument();
      // Tailwind min-h-11 (44px) class is the WCAG 2.5.5 enforcement.
      expect(btn.className).toMatch(/min-h-11/);
    }
    expect(screen.getByRole("button", { name: /close mobile preview/i })).toBeInTheDocument();
  });

  it("tabs through viewport switcher in visual order and exposes focus-visible styles", async () => {
    const user = userEvent.setup();
    render(<MobilePreview />);

    const expectedOrder = ["360px", "390px", "430px", "Close mobile preview"];
    const buttons = expectedOrder.map((n) =>
      screen.getByRole("button", { name: new RegExp(`^${n}$`, "i") })
    );

    // Walk Tab through the controls and assert each receives focus in order.
    for (const btn of buttons) {
      await user.tab();
      expect(document.activeElement).toBe(btn);
      // shadcn Button ships focus-visible:ring utilities - verify they're present.
      expect(btn.className).toMatch(/focus-visible:(ring|outline)/);
    }
  });

  it("close button collapses to a single FAB that is still keyboard reachable", async () => {
    const user = userEvent.setup();
    render(<MobilePreview />);
    await user.click(screen.getByRole("button", { name: /close mobile preview/i }));
    const fab = screen.getByRole("button", { name: /open mobile preview/i });
    expect(fab).toBeInTheDocument();
    expect(fab.className).toMatch(/h-12/); // 48px tap target
    await user.tab();
    expect(document.activeElement).toBe(fab);
  });
});