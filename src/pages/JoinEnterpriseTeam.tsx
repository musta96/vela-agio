import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function JoinEnterpriseTeam() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const token = params.get("token") ?? "";

  useEffect(() => {
    if (authLoading || !user || !token || status !== "idle") return;
    setStatus("working");
    supabase.functions.invoke("manage-enterprise-team", {
      body: { action: "accept_invite", token },
    }).then(({ data, error }) => {
      if (error || (data as any)?.error) {
        setStatus("error");
        setMessage((data as any)?.error ?? error?.message ?? "This invitation could not be accepted.");
        return;
      }
      setStatus("success");
      setMessage("You are now part of the Enterprise team.");
      toast.success("Team invitation accepted");
    });
  }, [authLoading, user, token, status]);

  if (authLoading || status === "working") {
    return <Centered><Loader2 className="h-5 w-5 animate-spin" /> Checking your invitation…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-semibold">Join your Enterprise team</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">Sign in or create your Vela account first, then open this invitation link again.</p>
        <Button onClick={() => navigate(`/auth?return=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>Sign in to continue</Button>
      </Centered>
    );
  }
  return (
    <Centered>
      {status === "success" ? <CheckCircle2 className="h-7 w-7 text-emerald-500" /> : <Users className="h-6 w-6 text-primary" />}
      <h1 className="text-lg font-semibold">{status === "success" ? "Invitation accepted" : "Invitation unavailable"}</h1>
      <p className="text-sm text-muted-foreground text-center max-w-sm">{message || "The invitation link is missing or invalid."}</p>
      <Button onClick={() => navigate("/enterprise/team")}>{status === "success" ? "Open team" : "Go to Vela"}</Button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[60vh] grid place-items-center p-6"><Card className="p-7 max-w-md w-full flex flex-col items-center gap-3">{children}</Card></div>;
}
