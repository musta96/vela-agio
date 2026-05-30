import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Runtime DOM auto-translator.
// Walks the rendered DOM after each route/render, collects visible English
// text nodes, batches them to the `translate-batch` edge function (Lovable AI
// Gateway), caches results in localStorage, and swaps text in place.
//
// Original text is preserved on the node via dataset.atOrig so switching back
// to English (or any prior language) restores instantly without a network hit.
// Marker `data-no-translate` on any ancestor opts out (use for tickers,
// code blocks, user-generated content).
// ---------------------------------------------------------------------------

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT", "TEXTAREA", "INPUT",
  "SVG", "PATH", "CANVAS", "IFRAME",
]);

// Heuristics for strings that should never be translated.
const TICKER_RE = /^[A-Z0-9]{1,6}(\.[A-Z]{1,4})?$/;            // AAPL, ENI.MI
const NUMERIC_RE = /^[\s\d.,%+\-€$£¥/x:()]+$/;                  // 1,234.50 €
const URL_RE = /^https?:\/\//i;

function shouldSkipText(t: string): boolean {
  const s = t.trim();
  if (s.length < 2) return true;
  if (TICKER_RE.test(s)) return true;
  if (NUMERIC_RE.test(s)) return true;
  if (URL_RE.test(s)) return true;
  // pure punctuation / symbol
  if (!/[a-zA-Z]/.test(s)) return true;
  return false;
}

function isInsideSkipped(node: Node): boolean {
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute("data-no-translate")) return true;
    if (el.getAttribute("contenteditable") === "true") return true;
    el = el.parentElement;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cache strategy
// ---------------------------------------------------------------------------
// Bump CACHE_VERSION whenever the translation prompt, model, or any string
// post-processing changes — that invalidates all previously cached
// translations app-wide. Entries also expire after TTL_MS so long-lived
// installs eventually refresh.
//
// Per-entry shape (JSON): { v: number, t: string, ts: number, h: number }
//   v  = cache schema version
//   t  = translated text
//   ts = epoch ms when written
//   h  = 32-bit FNV-1a hash of the SOURCE text, used to detect collisions /
//        truncation when the source is replaced
//
// On startup we sweep stale entries (different version / expired) so the
// localStorage budget doesn't bloat forever.

const CACHE_VERSION = 2;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const KEY_PREFIX = "i18n-auto:";

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function cacheKey(lang: string, text: string) {
  // Include source hash in the key so when the source text changes the lookup
  // misses naturally (the old entry becomes orphaned and is swept later).
  return `${KEY_PREFIX}${lang}:${hash32(text).toString(36)}`;
}

function readCache(lang: string, text: string): string | null {
  try {
    const raw = localStorage.getItem(cacheKey(lang, text));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; t?: string; ts?: number; h?: number };
    if (parsed.v !== CACHE_VERSION) return null;
    if (parsed.h !== hash32(text)) return null;
    if (typeof parsed.ts === "number" && Date.now() - parsed.ts > TTL_MS) return null;
    return typeof parsed.t === "string" ? parsed.t : null;
  } catch { return null; }
}

function writeCache(lang: string, text: string, value: string) {
  try {
    const payload = JSON.stringify({ v: CACHE_VERSION, t: value, ts: Date.now(), h: hash32(text) });
    localStorage.setItem(cacheKey(lang, text), payload);
  } catch {
    // Quota exceeded — evict ~25% of our entries (oldest first) and retry once.
    try { evictOldest(0.25); } catch { /* ignore */ }
    try {
      const payload = JSON.stringify({ v: CACHE_VERSION, t: value, ts: Date.now(), h: hash32(text) });
      localStorage.setItem(cacheKey(lang, text), payload);
    } catch { /* still full, give up silently */ }
  }
}

function listOwnKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) out.push(k);
    }
  } catch { /* private mode */ }
  return out;
}

// Drop stale-version and expired entries. Called once on startup.
function sweepStale() {
  const now = Date.now();
  for (const k of listOwnKeys()) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const p = JSON.parse(raw);
      const expired = typeof p?.ts === "number" && now - p.ts > TTL_MS;
      if (p?.v !== CACHE_VERSION || expired) localStorage.removeItem(k);
    } catch {
      // Pre-v2 entries were stored as plain strings — wipe them.
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
  }
}

function evictOldest(fraction: number) {
  const entries: Array<{ k: string; ts: number }> = [];
  for (const k of listOwnKeys()) {
    try {
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      entries.push({ k, ts: typeof p?.ts === "number" ? p.ts : 0 });
    } catch {
      entries.push({ k, ts: 0 });
    }
  }
  entries.sort((a, b) => a.ts - b.ts);
  const drop = Math.max(1, Math.floor(entries.length * fraction));
  for (let i = 0; i < drop; i++) localStorage.removeItem(entries[i].k);
}

// Public helpers for debugging + manual invalidation (e.g. an admin "rebuild
// translations" button or QA flows). Exposed on window so they're reachable
// from the console without an import.
export function clearTranslationCache(lang?: string) {
  const prefix = lang ? `${KEY_PREFIX}${lang}:` : KEY_PREFIX;
  for (const k of listOwnKeys()) {
    if (k.startsWith(prefix)) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
  }
}

if (typeof window !== "undefined") {
  (window as any).__clearTranslationCache = clearTranslationCache;
  // Sweep once per page load.
  try { sweepStale(); } catch { /* ignore */ }
}

type NodeRecord = { node: Text; original: string };

function collectTextNodes(root: Node, out: NodeRecord[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const t = (n.nodeValue ?? "");
      if (!t.trim()) return NodeFilter.FILTER_REJECT;
      if (isInsideSkipped(n)) return NodeFilter.FILTER_REJECT;
      if (shouldSkipText(t)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    const tn = cur as Text;
    const original = (tn as any).dataset_original ?? tn.nodeValue ?? "";
    out.push({ node: tn, original });
  }
}

// Attribute translation (placeholders + titles + aria-labels) ---------------
const ATTR_TARGETS: Array<{ sel: string; attr: string }> = [
  { sel: "[placeholder]", attr: "placeholder" },
  { sel: "[title]", attr: "title" },
  { sel: "[aria-label]", attr: "aria-label" },
];

type AttrRecord = { el: Element; attr: string; original: string };

function collectAttrNodes(root: ParentNode, out: AttrRecord[]) {
  for (const { sel, attr } of ATTR_TARGETS) {
    const list = (root as Element).querySelectorAll?.(sel) ?? [];
    list.forEach((el) => {
      if ((el as HTMLElement).closest("[data-no-translate]")) return;
      const v = el.getAttribute(attr) ?? "";
      if (!v.trim() || shouldSkipText(v)) return;
      const key = `__atOrig_${attr}`;
      const original = (el as any)[key] ?? v;
      out.push({ el, attr, original });
    });
  }
}

async function translateBatch(targetLang: string, texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  try {
    const { data, error } = await supabase.functions.invoke("translate-batch", {
      body: { targetLang, texts },
    });
    if (error) return texts;
    const arr = (data as any)?.translations;
    if (!Array.isArray(arr) || arr.length !== texts.length) return texts;
    return arr.map((v: any, i: number) => (typeof v === "string" && v.trim() ? v : texts[i]));
  } catch {
    return texts;
  }
}

let runId = 0;
let suppressObserver = 0;

async function applyLanguage(targetLang: string) {
  const myRun = ++runId;

  // 1) Collect candidate nodes + attributes
  const textRecords: NodeRecord[] = [];
  collectTextNodes(document.body, textRecords);
  const attrRecords: AttrRecord[] = [];
  collectAttrNodes(document.body, attrRecords);

  // 2) Restore originals (handles switching language back) and store original on node
  for (const r of textRecords) {
    const orig = (r.node as any).__atOrig ?? r.node.nodeValue ?? "";
    (r.node as any).__atOrig = orig;
    r.original = orig;
  }
  for (const r of attrRecords) {
    const key = `__atOrig_${r.attr}`;
    const orig = (r.el as any)[key] ?? r.el.getAttribute(r.attr) ?? "";
    (r.el as any)[key] = orig;
    r.original = orig;
  }

  if (targetLang === "en") {
    // Restore everything
    for (const r of textRecords) if (r.node.nodeValue !== r.original) r.node.nodeValue = r.original;
    for (const r of attrRecords) if (r.el.getAttribute(r.attr) !== r.original) r.el.setAttribute(r.attr, r.original);
    return;
  }

  // 3) Build batch of unique unknown strings
  const allOriginals = new Set<string>();
  for (const r of textRecords) allOriginals.add(r.original.trim());
  for (const r of attrRecords) allOriginals.add(r.original.trim());

  const unknown: string[] = [];
  const map: Record<string, string> = {};
  allOriginals.forEach((s) => {
    if (!s) return;
    const cached = readCache(targetLang, s);
    if (cached) map[s] = cached;
    else unknown.push(s);
  });

  // 4) Apply cached translations immediately for snappy UX
  const applyMap = () => {
    suppressObserver++;
    for (const r of textRecords) {
      const v = map[r.original.trim()];
      if (v && r.node.nodeValue !== v) r.node.nodeValue = v;
    }
    for (const r of attrRecords) {
      const v = map[r.original.trim()];
      if (v && r.el.getAttribute(r.attr) !== v) r.el.setAttribute(r.attr, v);
    }
    // Release on next microtask after the mutation batch has flushed.
    queueMicrotask(() => { suppressObserver = Math.max(0, suppressObserver - 1); });
  };
  applyMap();

  // 5) Fetch unknowns in chunks of ≤40
  const CHUNK = 40;
  for (let i = 0; i < unknown.length; i += CHUNK) {
    if (myRun !== runId) return; // language changed, abort
    const slice = unknown.slice(i, i + CHUNK);
    const out = await translateBatch(targetLang, slice);
    slice.forEach((src, idx) => {
      const dst = out[idx];
      if (dst && dst !== src) {
        map[src] = dst;
        writeCache(targetLang, src, dst);
      }
    });
    if (myRun !== runId) return;
    applyMap();
  }
}

export function AutoTranslate() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const lang = i18n.resolvedLanguage ?? "en";
  const timer = useRef<number | null>(null);

  // Re-translate when route changes or language changes. Debounce so rapid
  // re-renders coalesce into a single pass.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { applyLanguage(lang); }, 250);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [lang, location.pathname]);

  // Also observe DOM mutations for lazy-loaded content (cards, modals).
  useEffect(() => {
    if (lang === "en") return;
    let pending = false;
    const obs = new MutationObserver(() => {
      if (suppressObserver > 0) return;
      if (pending) return;
      pending = true;
      window.setTimeout(() => { pending = false; applyLanguage(lang); }, 600);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: false });
    return () => obs.disconnect();
  }, [lang]);

  // Set the <html lang> attribute for accessibility / SEO.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}