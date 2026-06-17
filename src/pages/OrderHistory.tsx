import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, History, RefreshCw } from "lucide-react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrokerRequiredOverlay } from "@/components/BrokerRequiredOverlay";

interface OrderRow {
  id: string;
  created_at: string;
  broker: string;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  limit_price: number | null;
  time_in_force: string;
  status: string;
  rationale: string | null;
  result: any;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  executed: "default",
  confirmed: "default",
  pending: "secondary",
  expired: "outline",
  cancelled: "outline",
  failed: "destructive",
};

export default function OrderHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [broker, setBroker] = useState<string>("all");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("live_order_intents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data) setRows(data as unknown as OrderRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const filtered = useMemo(() => {
    const q = symbol.trim().toUpperCase();
    return rows.filter(r => {
      if (q && !r.symbol.toUpperCase().includes(q)) return false;
      if (status !== "all" && r.status !== status) return false;
      if (broker !== "all" && r.broker !== broker) return false;
      const ts = new Date(r.created_at).getTime();
      if (from && ts < from.setHours(0, 0, 0, 0)) return false;
      if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); if (ts > end.getTime()) return false; }
      return true;
    });
  }, [rows, symbol, status, broker, from, to]);

  const brokers = useMemo(() => Array.from(new Set(rows.map(r => r.broker))), [rows]);

  const stats = useMemo(() => {
    const executed = filtered.filter(r => r.status === "executed" || r.status === "confirmed").length;
    const pending = filtered.filter(r => r.status === "pending").length;
    const failed = filtered.filter(r => r.status === "failed").length;
    return { total: filtered.length, executed, pending, failed };
  }, [filtered]);

  const clearFilters = () => { setSymbol(""); setStatus("all"); setBroker("all"); setFrom(undefined); setTo(undefined); };

  return (
    <BrokerRequiredOverlay>
    <div className="p-6 sm:p-8 space-y-6">
      <SEO title="Order & Trade History - Vela" description="Review your live broker orders and trade history with symbol and date filters." path="/orders" />
      <PageHeader
        icon={History}
        title="Orders"
        description="Live broker orders submitted via the confirm-modal flow."
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

        <div className="bg-card border border-border rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-border grid grid-cols-2 sm:grid-cols-4">
          {[
            { label: "Total", value: stats.total, tone: "" },
            { label: "Executed", value: stats.executed, tone: "text-success" },
            { label: "Pending", value: stats.pending, tone: "" },
            { label: "Failed", value: stats.failed, tone: "text-destructive" },
          ].map((m) => (
            <div key={m.label} className="p-5 flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
              <span className={cn("text-2xl font-bold tracking-tight", m.tone)}>{m.value}</span>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input placeholder="Symbol (e.g. AAPL)" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="md:col-span-1" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="executed">Executed</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={broker} onValueChange={setBroker}>
              <SelectTrigger><SelectValue placeholder="Broker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brokers</SelectItem>
                {brokers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start font-normal", !from && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{from ? format(from, "PP") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start font-normal", !to && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{to ? format(to, "PP") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={to} onSelect={setTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" onClick={clearFilters}>Clear</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Orders ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead>TIF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rationale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No orders match your filters.</TableCell></TableRow>
                )}
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell className="uppercase text-xs">{r.broker}</TableCell>
                    <TableCell className="font-mono font-semibold">{r.symbol}</TableCell>
                    <TableCell><Badge variant={r.side === "buy" ? "default" : "destructive"}>{r.side.toUpperCase()}</Badge></TableCell>
                    <TableCell className="uppercase text-xs">{r.type}</TableCell>
                    <TableCell className="text-right font-mono">{Number(r.qty).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{r.limit_price ? Number(r.limit_price).toFixed(2) : "-"}</TableCell>
                    <TableCell className="uppercase text-xs">{r.time_in_force}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={r.rationale ?? ""}>{r.rationale ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
    </div>
    </BrokerRequiredOverlay>
  );
}