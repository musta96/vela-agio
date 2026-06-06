import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Eye, LogOut } from "lucide-react";
import {
  exitClientContext,
  getActiveClientContext,
  subscribeClientContext,
  type ClientContext,
} from "@/lib/clientContext";
import { CLIENT_ROLE_LABEL } from "@/lib/mandates";

/**
 * Persistent banner shown across the app whenever an advisor/broker is acting
 * inside a client's context. Read-only by default and audited on enter/exit.
 */
export function ClientContextBanner() {
  const { user } = useAuth();
  const [ctx, setCtx] = useState<ClientContext | null>(() => getActiveClientContext());

  useEffect(() => subscribeClientContext(() => setCtx(getActiveClientContext())), []);

  if (!ctx) return null;
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
      <div className="container mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
        <Eye className="h-3.5 w-3.5" />
        <span className="font-medium">Viewing client context:</span>
        <span>{ctx.displayName}</span>
        <span className="opacity-70">· {CLIENT_ROLE_LABEL[ctx.role]} · read-only</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
          onClick={() => exitClientContext(user?.id)}
        >
          <LogOut className="h-3.5 w-3.5" /> Exit context
        </Button>
      </div>
    </div>
  );
}