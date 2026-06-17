import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, History, Settings as SettingsIcon, Check, Plus } from "lucide-react";
import { CopilotChat } from "@/components/CopilotChat";

const SUGGESTED = [
  "Brief me on today's macro",
  "Explain UCG.MI in 3 bullets",
  "Find me a hedge for EU banks",
  "Italian tax impact if I sell ENEL",
  "Build a 3-ETF passive allocation",
  "Why is gold rallying?",
];

const CONTEXT_PILLS = ["Portfolio", "Watchlist", "Risk Engine", "Macro feed"];

export default function Copilot() {
  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="AI Copilot | Vela.ai" description="Chat with your portfolio-aware investment copilot" path="/copilot" />
      <PageHeader
        icon={Sparkles}
        title="Vela AI Assistant"
        description="Context-aware co-pilot. It knows your portfolio, watchlist and risk profile."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2"><History className="h-4 w-4" /> History</Button>
            <Button variant="outline" size="sm" className="gap-2"><SettingsIcon className="h-4 w-4" /> Settings</Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <Card className="flex flex-col min-h-[70vh] overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-3 py-1">Context: Portfolio</span>
            <span className="inline-flex items-center rounded-full bg-muted text-foreground text-xs font-medium px-3 py-1">Tone: concise</span>
            <span className="inline-flex items-center rounded-full bg-muted text-foreground text-xs font-medium px-3 py-1">Italian tax mode</span>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <CopilotChat />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 rounded-2xl">
            <h3 className="text-sm font-semibold mb-3">Suggested prompts</h3>
            <div className="space-y-2">
              {SUGGESTED.map((p) => (
                <button
                  key={p}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/60 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5 rounded-2xl">
            <h3 className="text-sm font-semibold mb-3">Connected context</h3>
            <div className="flex flex-wrap gap-2">
              {CONTEXT_PILLS.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success text-xs font-medium px-3 py-1">
                  <Check className="h-3 w-3" /> {c}
                </span>
              ))}
              <button className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground text-xs font-medium px-3 py-1 hover:bg-muted/80">
                <Plus className="h-3 w-3" /> Email digest
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}