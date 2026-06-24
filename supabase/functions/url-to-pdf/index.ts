import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BROWSERLESS_URL = Deno.env.get('BROWSERLESS_URL') ?? 'https://production-sfo.browserless.io';
const BROWSERLESS_API_KEY = Deno.env.get('BROWSERLESS_API_KEY') ?? '';

type Body = {
  url: string;
  filename?: string;
  options?: Record<string, unknown>; // Browserless /pdf options (format, printBackground, margin, etc.)
  gotoOptions?: Record<string, unknown>;
  waitForSelector?: string;
  emulateMediaType?: 'screen' | 'print';
  download?: boolean; // when true, return as attachment
};

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return bad(405, 'Method not allowed');
  if (!BROWSERLESS_API_KEY) return bad(500, 'BROWSERLESS_API_KEY not configured');

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const url = (body.url ?? '').trim();
  if (!url) return bad(400, 'url required');
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return bad(400, 'url must be http(s)');
  } catch {
    return bad(400, 'url is not a valid URL');
  }

  const endpoint = `${BROWSERLESS_URL.replace(/\/$/, '')}/pdf?token=${encodeURIComponent(BROWSERLESS_API_KEY)}`;
  const payload = {
    url,
    options: {
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
      ...(body.options ?? {}),
    },
    gotoOptions: { waitUntil: 'networkidle2', timeout: 45000, ...(body.gotoOptions ?? {}) },
    ...(body.waitForSelector ? { waitForSelector: { selector: body.waitForSelector, timeout: 15000 } } : {}),
    emulateMediaType: body.emulateMediaType ?? 'screen',
  };

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return bad(502, `Browserless fetch failed: ${(e as Error).message}`);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return bad(upstream.status, `Browserless error: ${text.slice(0, 500)}`);
  }

  const pdf = await upstream.arrayBuffer();
  const filename = (body.filename ?? 'page.pdf').replace(/[^\w.\-]+/g, '_');
  const disposition = body.download ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`;

  return new Response(pdf, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
});