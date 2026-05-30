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

function cacheKey(lang: string, text: string) {
  return `i18n-auto:${lang}:${text}`;
}

function readCache(lang: string, text: string): string | null {
  try { return localStorage.getItem(cacheKey(lang, text)); } catch { return null; }
}

function writeCache(lang: string, text: string, value: string) {
  try { localStorage.setItem(cacheKey(lang, text), value); } catch { /* quota */ }
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