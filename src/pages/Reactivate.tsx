import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import VelaLogo from "@/components/VelaLogo";
import { useAuth } from "@/hooks/useAuth";
import { UpdatePaymentMethodModal } from "@/components/billing/UpdatePaymentMethodModal";

export default function Reactivate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth?returnTo=/reactivate", { replace: true });
    else setOpen(true);
  }, [loading, user]);

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <SEO title="Reactivate Pro — Vela" description="Reactivate your Vela Pro plan by updating your payment method." path="/reactivate" />
      <main className="w-full max-w-xl mx-auto">
        <Link to="/" className="flex items-center justify-center mb-6"><VelaLogo size={32} /></Link>
        <Card className="p-6 space-y-3">
          <h1 className="text-xl font-bold">Reactivate your Pro plan</h1>
          <p className="text-sm text-muted-foreground">
            Update your payment method to restart Pro access right away. Your existing account, portfolios, and settings are all preserved — you're just re-enabling billing.
          </p>
          <Button onClick={() => setOpen(true)}>Update payment method</Button>
        </Card>
      </main>
      {user && (
        <UpdatePaymentMethodModal
          open={open}
          onOpenChange={setOpen}
          hasOpenInvoice
          onSuccess={() => setTimeout(() => navigate("/dashboard"), 1200)}
        />
      )}
    </div>
  );
}