/**
 * Smoke test — /explore rails render InstrumentCard for many symbols and
 * live quotes may arrive incomplete (undefined price, missing change, or
 * no quote at all). Regressions here have caused route-level crashes with
 * "Cannot read properties of undefined (reading 'toLocaleString')".
 *
 * This test guards the render contract: an InstrumentCard must never throw
 * on partial data.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InstrumentCard } from "@/components/explore/InstrumentCard";

describe("InstrumentCard resilience (smoke)", () => {
  it("renders when quote is entirely undefined", () => {
    render(
      <MemoryRouter>
        <InstrumentCard symbol="AAPL" name="Apple" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Apple")).toBeInTheDocument();
  });

  it("renders when quote.price is undefined and change is missing", () => {
    render(
      <MemoryRouter>
        <InstrumentCard
          symbol="MSFT"
          name="Microsoft"
          quote={{ price: undefined as unknown as number, change: undefined as unknown as number, currency: "USD" } as any}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Microsoft")).toBeInTheDocument();
  });

  it("renders when quote.price is NaN", () => {
    render(
      <MemoryRouter>
        <InstrumentCard
          symbol="TSLA"
          name="Tesla"
          quote={{ price: Number.NaN, change: 0, currency: "USD" } as any}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Tesla")).toBeInTheDocument();
  });

  it("renders a valid quote correctly", () => {
    render(
      <MemoryRouter>
        <InstrumentCard
          symbol="NVDA"
          name="NVIDIA"
          quote={{ price: 1234.5, change: 1.23, currency: "USD" } as any}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("NVIDIA")).toBeInTheDocument();
    expect(screen.getByText(/1,234/)).toBeInTheDocument();
  });
});