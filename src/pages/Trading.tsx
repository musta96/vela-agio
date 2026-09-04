import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { LineChart } from "lucide-react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PaperTrading from "@/pages/PaperTrading";
import OrderHistory from "@/pages/OrderHistory";
import { TradeJournal } from "@/components/trading/TradeJournal";

const TABS = ["paper", "orders", "journal"] as const;
type Tab = (typeof TABS)[number];

/**
 * Unified trading surface.
 *
 * Replaces the three overlapping pages /paper-trading, /orders and /blotter,
 * which all showed slices of the same workflow. Those paths now redirect here
 * with the matching tab preselected, so old links and bookmarks keep working.
 */
export default function Trading() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : "paper";

  // Normalise the URL so the active tab is always shareable.
  useEffect(() => {
    if (requested !== tab) {
      const next = new URLSearchParams(params);
      next.set("tab", tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, requested]);

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      <SEO
        title="Trading — paper trading, orders & journal | Vela.ai"
        description="Paper trading, order history and your trade journal in one place, with realised and unrealised P&L in your base currency."
        path="/trading"
      />
      <PageHeader
        icon={LineChart}
        title="Trading"
        description="Simulate, review and journal every trade in one place."
      />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          next.set("tab", v);
          setParams(next);
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="paper">Paper trading</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="paper" className="mt-4">
          <PaperTrading embedded />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <OrderHistory embedded />
        </TabsContent>
        <TabsContent value="journal" className="mt-4">
          <TradeJournal />
        </TabsContent>
      </Tabs>
    </div>
  );
}
