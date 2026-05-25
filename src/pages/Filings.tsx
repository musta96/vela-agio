import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { FileText, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Filings() {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState("AAPL");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setNote(null);
    const { data } = await supabase.functions.invoke("sec-edgar", { body: { symbol, kind: "filings" } });
    setItems(data?.items ?? []); setNote(data?.note ?? null);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="SEC Filings | FTSE MIB Analytics" description="10-K, 10-Q, 8-K, 13F filings from SEC EDGAR" path="/filings" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">{t("pages.filings.title")}</h1>
        </div>
        <p className="text-muted-foreground">{t("pages.filings.subtitle")}</p>
        <div className="flex gap-2 max-w-md">
          <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder={t("pages.filings.ticker")} />
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pages.filings.load")}</Button>
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <div className="space-y-2">
          {items.map((f, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{f.form}</Badge>
                  <span className="font-mono text-sm">{f.date}</span>
                  <span className="text-sm text-muted-foreground">{f.accession}</span>
                </div>
                <Button asChild variant="outline" size="sm"><a href={f.url} target="_blank" rel="noreferrer">Open <ExternalLink className="h-3 w-3 ml-1" /></a></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}