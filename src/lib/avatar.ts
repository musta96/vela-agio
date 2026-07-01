import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Avatar values may be stored as either a storage path (new) or a legacy
 * public URL (old). This helper normalises to a path relative to the
 * "avatars" bucket.
 */
export function avatarPathFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Legacy: https://<project>.supabase.co/storage/v1/object/public/avatars/<path>
  const m = trimmed.match(/\/object\/(?:public|sign)\/avatars\/(.+?)(?:\?|$)/);
  if (m) return decodeURIComponent(m[1]);
  // External URL (e.g. Google avatar) — return as-is via a sentinel prefix.
  if (/^https?:\/\//i.test(trimmed)) return `__external__:${trimmed}`;
  return trimmed;
}

/** Hook that resolves a stored avatar value into a fresh signed URL. */
export function useSignedAvatarUrl(value: string | null | undefined, ttlSeconds = 3600): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const path = avatarPathFromValue(value);
    if (!path) { setUrl(null); return; }
    if (path.startsWith("__external__:")) { setUrl(path.slice("__external__:".length)); return; }
    (async () => {
      const { data } = await supabase.storage.from("avatars").createSignedUrl(path, ttlSeconds);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [value, ttlSeconds]);
  return url;
}