import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Landing from "./Landing";

export default function Home() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const forceLanding = params.get("preview") === "landing";
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (user && !forceLanding) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}