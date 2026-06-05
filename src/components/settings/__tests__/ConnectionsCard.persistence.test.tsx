import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// In-memory "profiles" row that survives "refresh" by re-rendering.
const profileRow: { ai_provider: string; ai_model: string | null } = {
  ai_provider: "anthropic",
  ai_model: "claude-sonnet-4-5",
};
const upsertSpy = vi.fn(async (next: any) => {
  Object.assign(profileRow, { ai_provider: next.ai_provider, ai_model: next.ai_model });
  return { error: null };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ...profileRow } }) }),
      }),
      upsert: (next: any) => upsertSpy(next),
    }),
  },
}));
vi.mock("@/lib/userApiKeys", async () => {
  const actual = await vi.importActual<any>("@/lib/userApiKeys");
  return {
    ...actual,
    vaultList: async () => [],
    vaultSet: vi.fn(),
    vaultDelete: vi.fn(),
    vaultHealth: async () => ({ ok: true, encryption_key: { present: true } }),
    generateEncryptionKey: () => "test-key",
  };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConnectionsCard } from "@/components/settings/ConnectionsCard";

describe("ConnectionsCard — AI provider/model persistence", () => {
  beforeEach(() => upsertSpy.mockClear());

  it("loads the stored provider and model from the profile (survives refresh)", async () => {
    // Radix Select renders its current value inside a hidden span on the
    // trigger. We inspect the DOM directly rather than relying on a label.
    const { container, unmount } = render(<ConnectionsCard />);
    await waitFor(() => {
      const triggers = container.querySelectorAll('[role="combobox"]');
      expect(triggers.length).toBeGreaterThanOrEqual(2);
      expect(triggers[0].textContent).toMatch(/Anthropic/i);
      expect(triggers[1].textContent).toMatch(/Claude Sonnet 4\.5/i);
    });
    unmount();

    // Simulate a hard refresh: a new mount must read the same persisted row.
    const { container: c2 } = render(<ConnectionsCard />);
    await waitFor(() => {
      const triggers = c2.querySelectorAll('[role="combobox"]');
      expect(triggers[0].textContent).toMatch(/Anthropic/i);
      expect(triggers[1].textContent).toMatch(/Claude Sonnet 4\.5/i);
    });
  });
});
