import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

export const OWNER_EMAIL = "mustarelli.edoardo@gmail.com";

export function OwnerRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if ((user.email || "").toLowerCase() !== OWNER_EMAIL) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}