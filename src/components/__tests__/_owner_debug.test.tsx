import { describe, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "x@y" }, loading: false }) }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>404</div> }));
vi.mock("react-router-dom", () => ({ Navigate: () => null, useLocation: () => ({ pathname: "/", search: "" }), Link: ({children}: any) => <a>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }), channel: () => channel, removeChannel: () => {}, auth: { signOut: vi.fn() } } };
});

import { OwnerRoute } from "@/components/ProtectedRoute";

describe("dbg", () => {
  it("renders", async () => {
    render(<OwnerRoute><div>SECRET</div></OwnerRoute>);
    await new Promise(r => setTimeout(r, 200));
    screen.debug(undefined, 20000);
  });
});
