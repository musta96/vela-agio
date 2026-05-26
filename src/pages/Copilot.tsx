import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CopilotChat } from "@/components/CopilotChat";

export default function Copilot() {
  const { t } = useTranslation();
  return (
    <div className="p-6 sm:p-8 flex flex-col min-h-[calc(100vh-4rem)]">
      <SEO title="AI Copilot | Vela.ai" description="Chat with your portfolio-aware investment copilot" path="/copilot" />
      <PageHeader
        icon={Sparkles}
        title={t("pages.copilot.title")}
        description="Portfolio-aware research assistant. Ask anything about your positions, signals, or market context."
      />
      <Card className="flex-1 flex flex-col min-h-[70vh] overflow-hidden">
        <CopilotChat />
      </Card>
    </div>
  );
}