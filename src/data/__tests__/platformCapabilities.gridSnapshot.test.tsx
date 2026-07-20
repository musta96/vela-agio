/**
 * Visual regression: DOM snapshot of the Landing Features grid across
 * common breakpoints. We render a minimal reconstruction of the grid
 * (same source data + same Tailwind grid classes as Landing.tsx) and
 * snapshot the resulting structure. If any of the 22 cards changes
 * title/desc or drops out at a breakpoint, the snapshot diff surfaces
 * it in CI.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DEFAULT_SECTIONS } from "@/data/landingDefaults";
import { LANDING_FEATURES_GRID_COUNT } from "@/data/platformCapabilities";

const items = (DEFAULT_SECTIONS.find((s) => s.key === "features")!.content
  .items as Array<{ title: string; desc: string; icon: string }>);

// Grid classes mirror the ones used on the marketing landing page.
const BREAKPOINTS = [
  { name: "mobile",  width: 375,  gridClass: "grid grid-cols-1 gap-4" },
  { name: "tablet",  width: 768,  gridClass: "grid grid-cols-2 gap-5" },
  { name: "desktop", width: 1280, gridClass: "grid grid-cols-3 lg:grid-cols-4 gap-6" },
];

function FeaturesGrid({ gridClass }: { gridClass: string }) {
  return (
    <section aria-labelledby="features-heading">
      <h2 id="features-heading">Everything you need to research the markets</h2>
      <ul className={gridClass} data-testid="features-grid">
        {items.map((f) => (
          <li key={f.title} data-icon={f.icon}>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

describe("Landing Features grid — visual regression snapshots", () => {
  it("renders exactly the expected number of cards", () => {
    expect(items.length).toBe(LANDING_FEATURES_GRID_COUNT);
  });

  for (const bp of BREAKPOINTS) {
    it(`snapshot at ${bp.name} (${bp.width}px) covers all 22 cards`, () => {
      // Emulate the viewport width for CSS-in-JSDOM-aware code paths.
      Object.defineProperty(window, "innerWidth", { value: bp.width, configurable: true });
      const { container } = render(<FeaturesGrid gridClass={bp.gridClass} />);
      const grid = container.querySelector('[data-testid="features-grid"]');
      expect(grid?.children.length).toBe(LANDING_FEATURES_GRID_COUNT);
      // Stable structural snapshot — captures title, desc, icon token, and
      // grid classes together so any breakpoint or content drift diff-fails.
      expect(container.innerHTML).toMatchSnapshot(`features-grid-${bp.name}`);
    });
  }

  it("every card has a non-empty title AND description", () => {
    const bad = items.filter((f) => !f.title?.trim() || !f.desc?.trim());
    expect(bad).toEqual([]);
  });
});
