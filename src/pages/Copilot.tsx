import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CopilotChat } from "@/components/CopilotChat";

export default function Copilot() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="AI Copilot | Vela.ai" description="Chat with your portfolio-aware investment copilot" path="/copilot" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 flex-1 flex flex-col max-w-4xl w-full">
        <div className="flex items-center gap-3 mb-4"><Bot className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.copilot.title")}</h1></div>
        <Card className="flex-1 flex flex-col min-h-[70vh] overflow-hidden">
          <CopilotChat />
        </Card>
      </main>
    </div>
  );
}