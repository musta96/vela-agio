import { useState } from "react";
import { Bot, X, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CopilotChat } from "./CopilotChat";

export function CopilotFab() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (pathname === "/copilot" || pathname.startsWith("/auth") || pathname.startsWith("/privacy") || pathname.startsWith("/terms") || pathname.startsWith("/cookies") || pathname.startsWith("/disclaimer")) return null;
  if (!user) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
         className="fixed right-4 md:right-6 z-40 h-14 w-14 bottom-[calc(var(--mobile-nav-inset)+12px)] md:bottom-6 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
          aria-label="Open Copilot"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div
         className="fixed right-4 md:right-6 z-40 bottom-[calc(var(--mobile-nav-inset)+12px)] md:bottom-6 w-[min(calc(100vw-2rem),400px)] h-[min(calc(100dvh-var(--mobile-nav-inset)-7rem),600px)] md:h-[min(calc(100vh-6rem),600px)] rounded-xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-label="Vela Copilot"
        >
          <div className="border-b border-border bg-card px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-primary" /> Vela Copilot
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close Copilot">
              <Minus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <CopilotChat compact showThreads={false} />
          </div>
        </div>
      )}
    </>
  );
}

export default CopilotFab;