import { useLocation } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { getRouteMeta } from "@/lib/routeMeta";

/**
 * Baseline per-route title/description.
 *
 * Rendered once, high in the tree. Pages that render their own <SEO/> mount
 * later, and react-helmet-async keeps the last-mounted value, so page-level
 * metadata always overrides this fallback.
 */
export function RouteSEO() {
  const { pathname } = useLocation();
  const meta = getRouteMeta(pathname);
  return <SEO title={meta.title} description={meta.description} path={pathname} />;
}

export default RouteSEO;
