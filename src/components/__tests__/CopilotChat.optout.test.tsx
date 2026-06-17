import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- mocks ---------------------------------------------------------------
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { resolvedLanguage: "en" } }),
}));

import { CopilotChat } from "@/components/CopilotChat";
import { MemoryRouter } from "react-router-dom";

describe("CopilotChat - ai_opt_out 403 handling", () => {
  beforeEach(() => {
    // Mock the streamed edge function call to reject with the canonical
    // 403 ai_opt_out response. The chat must NOT retry and MUST surface a
    // friendly fallback instead of leaking the raw error to the user.
    (global as any).fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "ai_opt_out", reason: "AI disabled in Privacy settings." }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  it("does not stream, does not retry, shows a single fallback message on 403", async () => {
    render(
      <MemoryRouter>
        <CopilotChat />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText("pages.copilot.placeholder"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getAllByRole("button").pop()!);

    await waitFor(() =>
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument(),
    );
    expect((global as any).fetch).toHaveBeenCalledTimes(1); // no retry
  });
});
