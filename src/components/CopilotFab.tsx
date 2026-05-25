import { useState } from "react";
import { Bot, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CopilotChat } from "./CopilotChat";

export function CopilotFab() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();
  // Hide on the dedicated /copilot page and on auth/legal routes.
  if (pathname === "/copilot" || pathname.startsWith("/auth") || pathname.startsWith("/privacy") || pathname.startsWith("/terms") || pathname.startsWith("/cookies") || pathname.startsWith("/disclaimer")) return null;
  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        aria-label="Open Copilot"
      >
        <Bot className="h-6 w-6" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b p-3 flex flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2 text-sm"><Bot className="h-4 w-4 text-primary" /> Vela Copilot</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </SheetHeader>
          <div className="flex-1 min-h-0">
            <CopilotChat compact />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default CopilotFab;