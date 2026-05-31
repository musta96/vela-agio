// Public MCP discovery descriptor for Vela.
// Resolves at:  https://<project>.supabase.co/functions/v1/well-known-mcp
// Recommended to also proxy it from your custom domain root at
// `/.well-known/mcp` so Claude / ChatGPT connector pickers can auto-discover.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const descriptor = {
    schema_version: '2024-11-05',
    name: 'vela',
    display_name: 'Vela — Trading Strategy Platform',
    description:
      'Read-only access to Vela: real-time market quotes, strategy library search and a daily market briefing for US / EU / IT / global. ' +
      'Phase 1 tools are public; Phase 2 (per-account portfolio, fundamentals, backtests) and Phase 3 (write actions) require Vela OAuth.',
    publisher: { name: 'Vela', url: 'https://vela-agio.lovable.app' },
    transports: [
      {
        type: 'streamable-http',
        url: `${SUPABASE_URL}/functions/v1/mcp`,
        auth: 'none',
        notes: 'JSON-RPC 2.0 over HTTP. Accept: application/json, text/event-stream.',
      },
    ],
    tools: [
      { name: 'get_quote', phase: 1, auth: 'none', description: 'Latest price + daily change for any Yahoo-style ticker.' },
      { name: 'search_strategies', phase: 1, auth: 'none', description: "Search Vela's strategy library." },
      { name: 'get_briefing', phase: 1, auth: 'none', description: 'Snapshot of major indices for us | eu | it | global.' },
      { name: 'get_news_sentiment', phase: 2, auth: 'bearer', description: 'AI sentiment for a ticker (counted against plan quota).' },
      { name: 'scan_opportunities', phase: 2, auth: 'bearer', description: 'Run the Vela AI scanner against a universe.' },
      { name: 'related_instruments', phase: 2, auth: 'bearer', description: 'Peers and thematic neighbours for a symbol.' },
      { name: 'get_watchlist', phase: 2, auth: 'bearer', description: "Read the signed-in user's watchlist." },
      { name: 'get_portfolio', phase: 2, auth: 'bearer', description: "Read the signed-in user's holdings." },
    ],
    roadmap: {
      phase_2: ['get_strategy', 'get_fundamentals', 'backtest'],
      phase_3: ['save_strategy_to_watchlist', 'create_alert'],
    },
    contact: 'support@vela-agio.lovable.app',
  };

  return new Response(JSON.stringify(descriptor, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
});