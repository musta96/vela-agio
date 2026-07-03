import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpgradeStepper } from "@/components/upgrade/UpgradeStepper";

describe("UpgradeStepper", () => {
  it("marks review as active on the review page", () => {
    render(<UpgradeStepper current="review" />);
    const list = screen.getByTestId("upgrade-stepper");
    expect(list).toHaveAttribute("data-current-step", "review");
    // Only the current step gets aria-current="step"
    const current = list.querySelector('[aria-current="step"]');
    expect(current?.textContent).toBe("1");
  });

  it("advances to payment and marks review as done", () => {
    render(<UpgradeStepper current="payment" />);
    const list = screen.getByTestId("upgrade-stepper");
    expect(list).toHaveAttribute("data-current-step", "payment");
    const items = list.querySelectorAll("li");
    // Step 1 should show a check (done), step 2 should show "2" and be current.
    expect(items[0].querySelector("svg")).toBeTruthy();
    expect(items[1].querySelector('[aria-current="step"]')?.textContent).toBe("2");
    expect(items[2].querySelector('[aria-current="step"]')).toBeNull();
  });

  it("marks both review and payment as done on confirmation", () => {
    render(<UpgradeStepper current="confirm" />);
    const list = screen.getByTestId("upgrade-stepper");
    expect(list).toHaveAttribute("data-current-step", "confirm");
    const items = list.querySelectorAll("li");
    expect(items[0].querySelector("svg")).toBeTruthy();
    expect(items[1].querySelector("svg")).toBeTruthy();
    expect(items[2].querySelector('[aria-current="step"]')?.textContent).toBe("3");
  });
});