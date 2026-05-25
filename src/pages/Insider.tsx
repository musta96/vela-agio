import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Users, ExternalLink, Loader2 } from "lucide-react";

export default function Insider() {
  const [symbol, setSymbol] = useState("AAPL");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("sec-edgar", { body: { symbol, kind: "insider" } });
    setItems(data?.items ?? []);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Insider Transactions | FTSE MIB Analytics" description="SEC Form 3/4/5 insider filings" path="/insider" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Insider Transactions</h1></div>
        <p className="text-muted-foreground">SEC Form 3 (initial), 4 (changes), 5 (annual). Free from EDGAR.</p>
        <div className="flex gap-2 max-w-md">
          <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}</Button>
        </div>
        <div className="space-y-2">
          {items.map((f, i) => (
            <Card key={i}><CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3"><Badge>{f.form}</Badge><span className="font-mono text-sm">{f.date}</span></div>
              <Button asChild variant="outline" size="sm"><a href={f.url} target="_blank" rel="noreferrer">Open <ExternalLink className="h-3 w-3 ml-1" /></a></Button>
            </CardContent></Card>
          ))}
        </div>
      </main>
    </div>
  );
}