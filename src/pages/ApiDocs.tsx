import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code2 } from "lucide-react";

const ENDPOINTS = [
  { name: "GET /v1/quote/:symbol", body: "Live quote (price, change, vol). Cached 30s." },
  { name: "GET /v1/ohlc/:symbol?range=1y&interval=1d", body: "Historical OHLC bars." },
  { name: "POST /v1/screener", body: "Natural-language screener. Body: { query: string }. Returns matched tickers + factor scores." },
  { name: "POST /v1/research-report", body: "Generate institutional research PDF for a ticker. Body: { symbol, name? }." },
  { name: "POST /v1/portfolio/risk", body: "Submit a list of {symbol, weight} and receive VaR, CVaR, factor exposures, drawdown." },
  { name: "POST /v1/sentiment", body: "Multi-tier news sentiment for a ticker. Returns score and articles." },
  { name: "POST /v1/webhook/alerts", body: "Subscribe webhook URL for fired alert rules. Payload: { rule_id, symbol, kind, value, ts }." },
];

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-background">
      <SEO title="API & Webhooks | FTSE MIB Analytics" description="REST API + webhooks for institutional integration" path="/api" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3"><Code2 className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">API & Webhooks</h1></div>
        <p className="text-muted-foreground">Pull scores, screens and PDF reports into your own stack. Excel/Sheets add-in via the same endpoints.</p>
        <Card><CardHeader><CardTitle>Authentication</CardTitle></CardHeader><CardContent>
          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">Authorization: Bearer YOUR_API_KEY</pre>
          <p className="text-sm mt-2 text-muted-foreground">Generate keys in Settings → API access (Pro/Advisor/Enterprise tiers).</p>
        </CardContent></Card>
        {ENDPOINTS.map(e => (
          <Card key={e.name}><CardHeader><CardTitle className="font-mono text-base">{e.name}</CardTitle></CardHeader><CardContent><p className="text-sm">{e.body}</p></CardContent></Card>
        ))}
        <Card><CardHeader><CardTitle>SDKs & integrations</CardTitle></CardHeader><CardContent className="text-sm space-y-2">
          <div>• Python: <code>pip install ftse-mib-analytics</code> (coming)</div>
          <div>• Google Sheets: <code>=FMA("AAPL","price")</code> add-in (coming)</div>
          <div>• Excel: ribbon add-in via Office.js (coming)</div>
          <div>• Slack/Teams: native digest bots</div>
        </CardContent></Card>
      </main>
    </div>
  );
}