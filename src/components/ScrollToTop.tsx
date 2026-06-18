import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll to the top on every route change. Without this, navigating
 * between long pages keeps the previous scroll offset and content "flashes"
 * as the new page mounts at a non-zero scroll position.
 *
 * Uses a small deferred timeout so the scroll happens *after* React has
 * flushed the new route's DOM, which prevents mobile browsers from
 * re-applying the old scroll offset once the content height changes.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const id = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }, 0);
    return () => clearTimeout(id);
  }, [pathname]);
  return null;
}