import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskEmail } from "@/lib/maskEmail";
import { supabase } from "@/integrations/supabase/client";

type Ctx = { revealed: boolean; setRevealed: (v: boolean) => void };
const EmailRevealContext = createContext<Ctx>({ revealed: false, setRevealed: () => {} });

/**
 * Admin-only context: emails are masked by default. Toggling reveal
 * writes an audit entry so any unmask is attributable.
 */
export function EmailRevealProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealedState] = useState(false);
  const setRevealed = (v: boolean) => {
    setRevealedState(v);
    // Best-effort audit; do not block UI on failure.
    supabase.from("audit_log").insert({
      action: v ? "admin.pii.unmask_emails" : "admin.pii.mask_emails",
      entity: "admin_ui",
    } as any).then(() => {}, () => {});
  };
  // Auto-mask after 5 minutes of reveal as defense-in-depth.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealedState(false), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [revealed]);
  return (
    <EmailRevealContext.Provider value={{ revealed, setRevealed }}>
      {children}
    </EmailRevealContext.Provider>
  );
}

export function useEmailReveal() {
  return useContext(EmailRevealContext);
}

export function MaskedEmail({ email, className }: { email: string | null | undefined; className?: string }) {
  const { revealed } = useEmailReveal();
  if (!email) return <span className={className}>—</span>;
  return <span className={className} title={revealed ? email : "Email masked — toggle reveal in the header"}>{revealed ? email : maskEmail(email)}</span>;
}

export function EmailRevealToggle() {
  const { revealed, setRevealed } = useEmailReveal();
  return (
    <Button
      size="sm"
      variant={revealed ? "default" : "outline"}
      className="gap-1.5 h-8"
      onClick={() => {
        if (revealed) { setRevealed(false); return; }
        const reason = window.prompt(
          "Reveal user emails — please type a brief reason (logged to the audit trail):",
          ""
        );
        if (!reason || reason.trim().length < 4) return;
        // Tag the audit entry with the reason
        supabase.from("audit_log").insert({
          action: "admin.pii.unmask_emails.reason",
          entity: "admin_ui",
          payload: { reason: reason.trim() },
        } as any).then(() => {}, () => {});
        setRevealed(true);
      }}
    >
      {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {revealed ? "Hide emails (auto in 5 min)" : "Reveal emails"}
    </Button>
  );
}
