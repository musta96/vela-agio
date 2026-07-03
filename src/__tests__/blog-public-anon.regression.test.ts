/**
 * Regression: the public Blog page must return non-empty results when
 * queried by an anonymous user. Historically, security-related migrations
 * (making `blog_posts_public` security_invoker, tightening `blog_posts`
 * grants) have silently broken anon access and emptied the Blog page.
 *
 * This test hits the live PostgREST endpoint with the anon key and asserts:
 *   1. The request succeeds (no 401/403/permission-denied).
 *   2. At least one published row is returned.
 *
 * Run any time a security or RLS/grant change touches blog_* objects.
 */
import { describe, it, expect } from "vitest";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://pcisxjfgdrgpxzfzfscf.supabase.co";
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjaXN4amZnZHJncHh6Znpmc2NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NzE5NTMsImV4cCI6MjA5NTE0Nzk1M30.Jzpgk5XWGI8LuBrIQnkPzF_eFLIh8XzdTlrWF9OfaYA";

describe("blog_posts_public anon access", () => {
  it("returns at least one published post for anonymous users", async () => {
    const url = `${SUPABASE_URL}/rest/v1/blog_posts_public?select=id,slug,title,published&published=eq.true&limit=5`;
    const res = await fetch(url, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });

    const body = await res.text();
    expect(
      res.ok,
      `anon blog fetch failed (${res.status}): ${body}`,
    ).toBe(true);

    const rows = JSON.parse(body) as Array<{ id: string; slug: string }>;
    expect(
      Array.isArray(rows) && rows.length > 0,
      `anon received 0 rows from blog_posts_public — public Blog page will look empty. Body: ${body}`,
    ).toBe(true);
  }, 15_000);
});