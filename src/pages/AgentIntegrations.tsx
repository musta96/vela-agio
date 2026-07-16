import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, ExternalLink, ShieldCheck, Terminal, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MCP_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp`;

interface Snippet {
  title: string;
  tool: string;
  scope: "public" | "auth";
  prompt: string;
}

const SNIPPETS: Snippet[] = [
  {
    title: "Get a live quote",
    tool: "get_quote",
    scope: "public",
    prompt:
      "Use the Vela MCP tool `get_quote` to fetch the latest price of AAPL and ENI.MI, then tell me which one is up more today in percent terms.",
  },
  {
    title: "Review my watchlist",
    tool: "get_watchlist",
    scope: "auth",
    prompt:
      "Call `get_watchlist` on Vela to list the tickers I'm watching. Then call `get_quote` on each and give me a one-line summary per name, sorted by today's % change.",
  },
  {
    title: "Portfolio snapshot",
    tool: "get_portfolio",
    scope: "auth",
    prompt:
      "Use Vela's `get_portfolio` tool to pull my holdings. Compute my current portfolio value using `get_quote`, group by currency, and flag any position larger than 15% of the total.",
  },
  {
    title: "Backtest a mean-reversion idea",
    tool: "run_backtest",
    scope: "auth",
    prompt:
      "Run `run_backtest` on Vela for symbol NVDA over the last 2 years with preset `rsi`, rsi_buy=25, rsi_sell=75. Report CAGR, max drawdown, hit rate and how it compares to `buy_hold` for the same window.",
  },
];

export default function AgentIntegrations() {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Agent integrations (MCP) · Vela";
    const desc = "Connect Vela to Claude, ChatGPT, Cursor and Codex over MCP and query your portfolio, watchlist and backtests from any AI client.";
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) { tag = document.createElement("meta"); tag.setAttribute("name", "description"); document.head.appendChild(tag); }
    tag.setAttribute("content", desc);
  }, []);

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-16">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-3">Agent integrations</Badge>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Connect Vela to your AI client</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Vela exposes a Model Context Protocol (MCP) server so Claude, ChatGPT, Cursor, Codex
            and any other MCP-capable AI client can call live Vela tools — using your account,
            with your permissions, over OAuth.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Terminal className="h-4 w-4" /> Endpoint
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
              <span className="truncate flex-1">{MCP_URL}</span>
              <Button size="sm" variant="ghost" onClick={() => copy("url", MCP_URL)}>
                {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Add this URL as an MCP server in your AI client. Sign in with your Vela account
              when the OAuth consent screen appears — the assistant then calls tools as you.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 mb-10">
          <Feature icon={<ShieldCheck className="h-4 w-4" />} title="OAuth-gated" body="Each caller signs in as a Vela user. RLS scopes every read/write to their own data." />
          <Feature icon={<Zap className="h-4 w-4" />} title="Rate-limited" body="Authenticated tools are throttled per user per minute to keep responses fast." />
          <Feature icon={<Terminal className="h-4 w-4" />} title="Audit-logged" body="Every call is recorded (tool, latency, success) in your MCP call log for debugging." />
        </div>

        <h2 className="text-xl font-semibold mb-4">Example prompts</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Paste any of the prompts below into Claude, ChatGPT or Codex after connecting the Vela MCP server.
        </p>

        <div className="space-y-4">
          {SNIPPETS.map((s) => (
            <Card key={s.title}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{s.tool}</Badge>
                    <Badge variant={s.scope === "auth" ? "default" : "secondary"}>
                      {s.scope === "auth" ? "Auth" : "Public"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative rounded-md border bg-muted/40 p-3 pr-11 text-sm leading-relaxed">
                  {s.prompt}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute right-1 top-1"
                    onClick={() => copy(s.title, s.prompt)}
                  >
                    {copied === s.title ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="text-base">Available tools</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
            <ToolRow name="get_quote" desc="Latest price for any Yahoo-style ticker" scope="public" />
            <ToolRow name="search_strategies" desc="Search Vela's strategy library" scope="public" />
            <ToolRow name="project_dividends" desc="Deterministic dividend income projection" scope="public" />
            <ToolRow name="get_watchlist" desc="Your watchlist symbols" scope="auth" />
            <ToolRow name="get_portfolio" desc="Your portfolio holdings" scope="auth" />
            <ToolRow name="get_net_worth" desc="Net worth accounts and totals" scope="auth" />
            <ToolRow name="list_cash_flow" desc="Income and expense entries" scope="auth" />
            <ToolRow name="add_cash_flow_entry" desc="Record income or expense" scope="auth" />
            <ToolRow name="run_backtest" desc="Historical backtest with CAGR/DD/hit rate" scope="auth" />
          </CardContent>
        </Card>

        <div className="mt-10 flex items-center justify-between text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground">← Back to Vela</Link>
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            Learn about MCP <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium mb-1">{icon}{title}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function ToolRow({ name, desc, scope }: { name: string; desc: string; scope: "public" | "auth" }) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs">{name}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Badge variant={scope === "auth" ? "default" : "secondary"} className="text-[10px]">
        {scope}
      </Badge>
    </div>
  );
}