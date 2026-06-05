import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
  return { ...actual, vaultList: async () => [], vaultSet: vi.fn(), vaultDelete: vi.fn() };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConnectionsCard } from "@/components/settings/ConnectionsCard";

describe("ConnectionsCard — AI provider/model persistence", () => {
  beforeEach(() => upsertSpy.mockClear());

  it("loads the stored provider and model from the profile (survives refresh)", async () => {
    const { unmount } = render(<ConnectionsCard />);
    // Provider dropdown shows the saved Anthropic label.
    await waitFor(() =>
      expect(screen.getByText(/Anthropic Claude/i)).toBeInTheDocument(),
    );
    // Model dropdown shows the saved Claude Sonnet entry.
    expect(screen.getByText(/Claude Sonnet 4\.5/i)).toBeInTheDocument();
    unmount();

    // Simulate a hard refresh: a new mount must read the same persisted row.
    render(<ConnectionsCard />);
    await waitFor(() =>
      expect(screen.getByText(/Anthropic Claude/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Claude Sonnet 4\.5/i)).toBeInTheDocument();
  });
});
