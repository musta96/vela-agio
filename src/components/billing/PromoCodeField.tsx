import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, Tag } from "lucide-react";

export type PromoValidation = {
  valid: true;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  duration: "once" | "repeating" | "forever";
  durationLabel: string;
  original: { cents: number; currency: string; formatted: string };
  discount: { cents: number; currency: string; formatted: string };
  final: { cents: number; currency: string; formatted: string };
};

interface Props {
  /** Human-readable lookup key of the price the user is about to buy. */
  priceLookupKey: string;
  /** Called whenever the applied promo changes. Pass null when cleared. */
  onChange: (promo: PromoValidation | null) => void;
  /** Optional label override. */
  label?: string;
}

export function PromoCodeField({ priceLookupKey, onChange, label = "Have a promo code?" }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PromoValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("validate-promo-code", {
        body: { code: code.trim(), priceLookupKey, environment: getStripeEnvironment() },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!(data as any)?.valid) {
        setError((data as any)?.error ?? "That promo code isn't valid");
        setResult(null); onChange(null);
        return;
      }
      setResult(data as PromoValidation);
      onChange(data as PromoValidation);
    } catch (e) {
      setError((e as Error).message);
      setResult(null); onChange(null);
    } finally { setBusy(false); }
  };

  const clear = () => { setCode(""); setResult(null); setError(null); onChange(null); };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      >
        <Tag className="h-3 w-3" /> {label}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Promo code</span>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { clear(); setOpen(false); }}>Hide</button>
      </div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code"
          className="h-9 text-sm"
          disabled={busy || !!result}
        />
        {result ? (
          <Button size="sm" variant="outline" onClick={clear}><X className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button size="sm" onClick={apply} disabled={busy || code.trim().length < 2}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {result.percentOff ? `${result.percentOff}% off` : `${result.discount.formatted} off`} {result.durationLabel}
          </div>
          <div className="mt-1 text-muted-foreground">
            <span className="line-through">{result.original.formatted}</span>{" "}
            <span className="font-semibold text-foreground">{result.final.formatted}</span>
          </div>
        </div>
      )}
    </div>
  );
}