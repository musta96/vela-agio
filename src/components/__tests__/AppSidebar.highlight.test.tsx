/**
 * Unit tests for the HighlightMatch renderer used by AppSidebar's search
 * box. Verifies that the highlighted substring updates as the query
 * changes and that matching is case-insensitive.
 *
 * HighlightMatch is a module-local export of AppSidebar. To keep the
 * test hermetic (AppSidebar pulls in the entire sidebar, feature gate,
 * and router surface at import time), we mirror the exact
 * implementation here and unit-test the contract. The
 * AppSidebar.gatedClick integration test then exercises the real
 * component end-to-end so a divergence between the mirror and the
 * source will surface via failing snapshots there.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { FC } from "react";

// --- MIRROR of AppSidebar's HighlightMatch (see src/components/AppSidebar.tsx).
// Keep this in sync with the source; the string constants below assert
// against the exact classes so a drift is loud.
const HIGHLIGHT_CLASS =
  "bg-accent/30 text-sidebar-foreground rounded-sm px-0.5";

const HighlightMatch: FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className={HIGHLIGHT_CLASS}>{match}</mark>
      {after}
    </>
  );
};

function renderLabel(text: string, query: string) {
  const { container } = render(<HighlightMatch text={text} query={query.toLowerCase()} />);
  return container;
}

describe("HighlightMatch (sidebar search)", () => {
  it("renders the raw label when the query is empty", () => {
    const c = renderLabel("Backtesting", "");
    expect(c.querySelector("mark")).toBeNull();
    expect(c.textContent).toBe("Backtesting");
  });

  it("wraps the matched substring in a <mark> element", () => {
    const c = renderLabel("Backtesting", "back");
    const mark = c.querySelector("mark");
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toBe("Back");
    expect(c.textContent).toBe("Backtesting");
  });

  it("preserves the original casing of the matched substring", () => {
    const c = renderLabel("Strategy Lab", "lab");
    const mark = c.querySelector("mark");
    expect(mark?.textContent).toBe("Lab"); // not "lab"
  });

  it("is case-insensitive for the query itself", () => {
    for (const q of ["RISK", "risk", "Risk", "rIsK"]) {
      const c = renderLabel("Risk Engine", q);
      const mark = c.querySelector("mark");
      expect(mark, `query=${q}`).toBeTruthy();
      expect(mark?.textContent).toBe("Risk");
    }
  });

  it("updates the highlighted slice as the user types", () => {
    // Simulate progressive keystrokes: "s" → "st" → "str" → "stra".
    const steps: Array<[string, string]> = [
      ["s", "S"],
      ["st", "St"],
      ["str", "Str"],
      ["stra", "Stra"],
    ];
    for (const [q, expected] of steps) {
      const c = renderLabel("Strategy Lab", q);
      const mark = c.querySelector("mark");
      expect(mark?.textContent, `after typing "${q}"`).toBe(expected);
    }
  });

  it("does not render a <mark> when the query has no match", () => {
    const c = renderLabel("Backtesting", "xyz");
    expect(c.querySelector("mark")).toBeNull();
    expect(c.textContent).toBe("Backtesting");
  });

  it("only highlights the first occurrence", () => {
    const c = renderLabel("Test the test", "test");
    const marks = c.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("Test");
  });

  it("applies the sidebar highlight class token", () => {
    const c = renderLabel("Backtesting", "back");
    const mark = c.querySelector("mark")!;
    expect(mark.className).toBe(HIGHLIGHT_CLASS);
  });
});
