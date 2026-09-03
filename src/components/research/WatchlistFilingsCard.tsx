import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Eye, Loader2, RefreshCw, Sparkles, ExternalLink, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useWatchlist } from "@/hooks/useWatchlist";

export interface WatchFiling {
  symbol: string;
  form: string;
  date: string;
  url: string;
  accession?: string;
  isNew: boolean;
}

interface Props {
  onAnalyze: (f: WatchFiling) => void;
}

const SEEN_KEY = "vela.research-seen-filings";
const EARNINGS_FORMS = ["8-K", "6-K"];
const MAX_SYMBOLS = 12;

function readSeen(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" ? p : {};
  } catch { return {}; }
}

function writeSeen(next: Record<string, string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

export function WatchlistFilingsCard({ onAnalyze }: Props) {
  const { items } = useWatchlist();
  const symbols = useMemo(() => items.map((i) => i.symbol.toUpperCase()).slice(0, MAX_SYMBOLS), [items]);
  const [rows, setRows] = useState<WatchFiling[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [alertsOn, setAlertsOn] = useState(() => localStorage.getItem("vela.research-alerts") !== "off");
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (symbols.length === 0) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      const seen = readSeen();
      const results = await Promise.all(symbols.map(async (sym) => {
        const { data, error } = await supabase.functions.invoke("sec-edgar", { body: { symbol: sym, kind: "filings" } });
        if (error) throw new Error(`${sym}: ${error.message}`);
        const items = (data?.items ?? []) as { form: string; date: string; url: string; accession?: string }[];
        return items.slice(0, 5).map((f) => ({
          symbol: sym, form: f.form, date: f.date, url: f.url, accession: f.accession,
          isNew: !seen[sym] || f.date > seen[sym],
        }));
      }));
      const flat = results.flat().sort((a, b) => (a.date < b.date ? 1 : -1));
      setRows(flat);
      const fresh = flat.filter((f) => f.isNew);
      if (alertsOn && fresh.length > 0) {
        const earnings = fresh.filter((f) => EARNINGS_FORMS.includes(f.form)).length;
        toast.message(`${fresh.length} new filing${fresh.length > 1 ? "s" : ""} on your watchlist`, {
          description: earnings > 0
            ? `${earnings} potential earnings/8-K event — open one to generate the AI analysis.`
            : "Open any of them to generate the AI research note.",
        });
      }
    } catch (e: any) {
      setError(e?.message || "Could not load watchlist filings.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [symbols, alertsOn]);

  useEffect(() => { scan(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [symbols.join(",")]);

  const markAllSeen = () => {
    const seen = readSeen();
    for (const r of rows ?? []) if (!seen[r.symbol] || r.date > seen[r.symbol]) seen[r.symbol] = r.date;
    writeSeen(seen);
    setRows((rs) => (rs ?? []).map((r) => ({ ...r, isNew: false })));
  };

  const toggleAlerts = (v: boolean) => {
    setAlertsOn(v);
    localStorage.setItem("vela.research-alerts", v ? "on" : "off");
  };

  const newCount = (rows ?? []).filter((r) => r.isNew).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Eye className="h-4 w-4 text-primary" /> Watchlist filings & earnings
          {newCount > 0 && <Badge variant="destructive">{newCount} new</Badge>}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <BellRing className="h-3.5 w-3.5" /> Alerts
              <Switch checked={alertsOn} onCheckedChange={toggleAlerts} aria-label="Toggle new filing alerts" />
            </label>
            <Button size="sm" variant="ghost" onClick={scan} disabled={loading} aria-label="Rescan watchlist">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="outline" onClick={markAllSeen} disabled={newCount === 0}>Mark all seen</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {symbols.length === 0 && (
          <p className="text-sm text-muted-foreground">Your watchlist is empty. Add instruments to monitor new filings and earnings events here.</p>
        )}
        {error && <p className="text-sm text-bear">{error}</p>}
        {symbols.length > MAX_SYMBOLS && (
          <p className="text-[11px] text-muted-foreground">Monitoring the first {MAX_SYMBOLS} watchlist symbols.</p>
        )}
        {(rows ?? []).slice(0, 30).map((r, i) => (
          <div key={`${r.symbol}-${r.accession ?? r.url}-${i}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 p-2">
            <span className="w-16 font-medium text-sm">{r.symbol}</span>
            <Badge variant="secondary">{r.form}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{r.date}</span>
            {r.isNew && <Badge variant="destructive" className="text-[10px]">new</Badge>}
            {EARNINGS_FORMS.includes(r.form) && <Badge variant="outline" className="text-[10px]">earnings/event</Badge>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => onAnalyze(r)}><Sparkles className="mr-1 h-3 w-3" /> AI analyze</Button>
              <Button asChild size="sm" variant="outline">
                <a href={r.url} target="_blank" rel="noreferrer">Open <ExternalLink className="ml-1 h-3 w-3" /></a>
              </Button>
            </div>
          </div>
        ))}
        {rows && rows.length === 0 && symbols.length > 0 && !error && (
          <p className="text-sm text-muted-foreground">No SEC filings found for your watchlist symbols (non-US listings are not covered by EDGAR).</p>
        )}
      </CardContent>
    </Card>
  );
}
