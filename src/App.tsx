import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import StockDetails from "./pages/StockDetails";
import SentimentDashboard from "./pages/SentimentDashboard";
import BacktestingModule from "./pages/BacktestingModule";
import Portfolio from "./pages/Portfolio";
import Watchlist from "./pages/Watchlist";
import SmartPicks from "./pages/SmartPicks";
import TechnicalAnalysis from "./pages/TechnicalAnalysis";
import Compare from "./pages/Compare";
import SectorHeatmap from "./pages/SectorHeatmap";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import AdminAuditLog from "./pages/AdminAuditLog";
import Alerts from "./pages/Alerts";
import Risk from "./pages/Risk";
import Screener from "./pages/Screener";
import Baskets from "./pages/Baskets";
import Filings from "./pages/Filings";
import Earnings from "./pages/Earnings";
import Insider from "./pages/Insider";
import Macro from "./pages/Macro";
import Copilot from "./pages/Copilot";
import Goals from "./pages/Goals";
import EventStudy from "./pages/EventStudy";
import TaxHarvest from "./pages/TaxHarvest";
import Methodology from "./pages/Methodology";
import Onboarding from "./pages/Onboarding";
import Education from "./pages/Education";
import ApiDocs from "./pages/ApiDocs";
import Intraday from "./pages/Intraday";
import CorporateActions from "./pages/CorporateActions";
import Optimizer from "./pages/Optimizer";
import Rebalance from "./pages/Rebalance";
import Peers from "./pages/Peers";
import QuantAlpha from "./pages/QuantAlpha";
import Blotter from "./pages/Blotter";
import Notes from "./pages/Notes";
import Suitability from "./pages/Suitability";
import Pricing from "./pages/Pricing";
import { AuthProvider } from "./hooks/useAuth";
import { FeatureFlagsProvider } from "./hooks/useFeatureFlags";
import { PortfoliosProvider } from "./hooks/usePortfolios";
import AdminSettings from "./pages/AdminSettings";
import Advisor from "./pages/Advisor";
import AppShell from "./components/AppShell";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <FeatureFlagsProvider>
        <PortfoliosProvider>
        <Routes>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Index />} />
            <Route path="/sentiment" element={<SentimentDashboard />} />
            <Route path="/backtest" element={<BacktestingModule />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/picks" element={<SmartPicks />} />
            <Route path="/technical" element={<TechnicalAnalysis />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/sectors" element={<SectorHeatmap />} />
            <Route path="/stock/:symbol" element={<StockDetails />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/risk" element={<Risk />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/baskets" element={<Baskets />} />
            <Route path="/filings" element={<Filings />} />
            <Route path="/earnings" element={<Earnings />} />
            <Route path="/insider" element={<Insider />} />
            <Route path="/macro" element={<Macro />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/event-study" element={<EventStudy />} />
            <Route path="/tax-harvest" element={<TaxHarvest />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/learn" element={<Education />} />
            <Route path="/api" element={<ApiDocs />} />
            <Route path="/intraday" element={<Intraday />} />
            <Route path="/corporate-actions" element={<CorporateActions />} />
            <Route path="/optimizer" element={<Optimizer />} />
            <Route path="/rebalance" element={<Rebalance />} />
            <Route path="/peers" element={<Peers />} />
            <Route path="/quant" element={<QuantAlpha />} />
            <Route path="/blotter" element={<Blotter />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/suitability" element={<Suitability />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/admin/audit" element={<AdminAuditLog />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/advisor" element={<Advisor />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        </PortfoliosProvider>
        </FeatureFlagsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
