import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import { useAuth } from "@/hooks/useAuth";
import { UpgradeFlow } from "@/components/upgrade/UpgradeFlow";

export default function Reactivate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth?returnTo=/reactivate", { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <SEO title="Reactivate Pro — Vela" description="Restart your Vela Pro plan with one click. Use your saved card or enter a new one." path="/reactivate" />
      <main className="w-full max-w-2xl mx-auto space-y-6">
        <Link to="/" className="flex items-center justify-center"><VelaLogo size={32} /></Link>
        <Card className="p-5">
          <h1 className="text-xl font-bold">Welcome back to Vela</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your account, portfolios and settings are all still here. Restart Pro to unlock everything again — no new trial, charged immediately.
          </p>
        </Card>
        {user && <UpgradeFlow returnPath="/dashboard" />}
      </main>
    </div>
  );
}