import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { UpdatePaymentMethodModal } from "./UpdatePaymentMethodModal";
import { useLocation, useNavigate } from "react-router-dom";

type Card = { brand: string; last4: string; exp_month: number; exp_year: number } | null;

export function PaymentMethodCard() {
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<Card>(null);
  const [hasOpenInvoice, setHasOpenInvoice] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("get-payment-method", {
      body: { environment: getStripeEnvironment() },
    });
    setCard(data?.card ?? null);
    setHasOpenInvoice(Boolean(data?.hasOpenInvoice));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-open when arriving from a dunning email/banner with ?update_pm=1
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("update_pm") === "1") {
      setOpen(true);
      p.delete("update_pm");
      navigate({ pathname: location.pathname, search: p.toString() ? `?${p.toString()}` : "" }, { replace: true });
    }
  }, [location.search]);

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment method</h3>
          {loading ? (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
          ) : card ? (
            <p className="text-sm mt-1 capitalize">
              {card.brand} •••• {card.last4}
              <span className="text-xs text-muted-foreground ml-2">
                Expires {String(card.exp_month).padStart(2, "0")}/{String(card.exp_year).slice(-2)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">No card on file.</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {card ? "Update" : "Add card"}
        </Button>
      </div>
      <UpdatePaymentMethodModal
        open={open}
        onOpenChange={setOpen}
        hasOpenInvoice={hasOpenInvoice}
        onSuccess={load}
      />
    </Card>
  );
}