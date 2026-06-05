import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

// Force the Privacy page into its default redacted mode by stubbing supabase.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { enabled: true } }) }),
      }),
    }),
  },
}));

import Privacy from "@/pages/legal/Privacy";
import Terms from "@/pages/legal/Terms";
import Cookies from "@/pages/legal/Cookies";
import Disclaimer from "@/pages/legal/Disclaimer";

// PII that MUST NEVER leak on these pages (the personal Gmail contact and
// the Codice Fiscale are not legally required when a P.IVA is published).
const FORBIDDEN_PII = [
  LEGAL_ENTITY.contactEmail,        // personal gmail
  LEGAL_ENTITY.taxCode,             // Codice Fiscale
].filter(Boolean) as string[];

function html(node: HTMLElement) {
  // Include head metas too — JSON-LD lives in <head>.
  return (document.head.innerHTML + node.innerHTML).toLowerCase();
}

describe("legal pages — PII redaction", () => {
  it.each([
    ["Terms",      <Terms />],
    ["Cookies",    <Cookies />],
    ["Disclaimer", <Disclaimer />],
  ])("%s never exposes personal email or Codice Fiscale", (_name, jsx) => {
    const { container } = render(<MemoryRouter>{jsx}</MemoryRouter>);
    const body = html(container);
    for (const pii of FORBIDDEN_PII) {
      expect(body).not.toContain(pii.toLowerCase());
    }
    // Generic brand-only contacts should be the only mailto on these pages.
    expect(body).not.toMatch(/mailto:[^"]*gmail/);
  });

  it("Privacy page redacts Codice Fiscale and personal email by default", async () => {
    const { container, findByText } = render(<MemoryRouter><Privacy /></MemoryRouter>);
    // Wait for the async platform_controls read to settle.
    await findByText(/Data Controller/i);
    const body = html(container);
    expect(body).not.toContain(LEGAL_ENTITY.taxCode!.toLowerCase());
    expect(body).not.toContain(LEGAL_ENTITY.contactEmail.toLowerCase());
    // Legally required identifiers MUST still be present.
    expect(body).toContain(LEGAL_ENTITY.vatNumber!.toLowerCase());
    expect(body).toContain(LEGAL_ENTITY.pec!.toLowerCase());
  });
});
