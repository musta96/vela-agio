import { Link } from "react-router-dom";
import { ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { PRIVILEGED_ROLES } from "@/components/ProtectedRoute";

interface Props {
  email?: string | null;
  currentRoles: string[];
  onRecheck: () => void;
  rechecking?: boolean;
}

export default function OwnerUnauthorized({ email, currentRoles, onRecheck, rechecking }: Props) {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-xl w-full border-amber-400/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <CardTitle>Owner console access required</CardTitle>
              <CardDescription>
                Your account doesn't currently hold a role that grants Owner Console access.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-medium">{email || "—"}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-muted-foreground">Your roles</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {currentRoles.length === 0
                  ? <Badge variant="outline" className="text-[10px]">none</Badge>
                  : currentRoles.map(r => (
                      <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                    ))}
              </div>
            </div>
            <div className="flex items-start justify-between mt-2 gap-3">
              <span className="text-muted-foreground">Required (any of)</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {PRIVILEGED_ROLES.map(r => (
                  <Badge key={r} variant="outline" className="text-[10px] border-amber-400/40 text-amber-600 dark:text-amber-400">{r}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium">How to resolve</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Ask an existing admin to grant your account one of the privileged roles.</li>
              <li>Once granted, click <span className="font-medium text-foreground">Re-check access</span> below — no refresh needed.</li>
              <li>If that fails, sign out and sign back in to mint a fresh session token.</li>
              <li>Privileged surfaces also require MFA to be enabled on your account.</li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={onRecheck} disabled={rechecking} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${rechecking ? "animate-spin" : ""}`} />
              Re-check access
            </Button>
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="h-4 w-4" /> Sign out & back in
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-1">
            This page automatically re-checks your role in the background, so the console will open as soon as it's granted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}