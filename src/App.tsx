import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import SignupTrial from "./pages/SignupTrial";
import SignupTrialReturn from "./pages/SignupTrialReturn";
import Reactivate from "./pages/Reactivate";
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
import PortfolioSimulations from "./pages/PortfolioSimulations";
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
import OrderHistory from "./pages/OrderHistory";
import Profile from "./pages/Profile";
import Security from "./pages/Security";
import AIScanner from "./pages/AIScanner";
import RelatedInstruments from "./pages/RelatedInstruments";
import ExploreThemes from "./pages/ExploreThemes";
import ThematicCompanyDrilldown from "./pages/ThematicCompanyDrilldown";
import OptionsChain from "./pages/OptionsChain";
import Futures from "./pages/Futures";
import Notes from "./pages/Notes";
import Documents from "./pages/Documents";
import Suitability from "./pages/Suitability";
import Pricing from "./pages/Pricing";
import PlansBilling from "./pages/PlansBilling";
import Upgrade from "./pages/Upgrade";
import PricingRedirect from "./components/PricingRedirect";
import LegalDoc from "./pages/LegalDoc";
import CheckoutReturn from "./pages/CheckoutReturn";
import DealFlow from "./pages/DealFlow";
import PrivacySettings from "./pages/PrivacySettings";
import Home from "./pages/Home";
import Features from "./pages/Features";
import ContactSales from "./pages/ContactSales";
import NetWorth from "./pages/NetWorth";
import NetWorthCategory from "./pages/NetWorthCategory";
import Explore from "./pages/Explore";
import Support from "./pages/Support";
import Movers from "./pages/Movers";
import AIStocksToWatch from "./pages/AIStocksToWatch";
import PaperTrading from "./pages/PaperTrading";
import OwnerConsole from "./pages/OwnerConsole";
import RedeemReferral from "./pages/RedeemReferral";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { AuthProvider } from "./hooks/useAuth";
import { FeatureFlagsProvider } from "./hooks/useFeatureFlags";
import { PortfoliosProvider } from "./hooks/usePortfolios";
import { ThemeProvider } from "./hooks/useTheme";
import AdminSettings from "./pages/AdminSettings";
import AdminAiQuotas from "./pages/AdminAiQuotas";
import AiUsageHistory from "./pages/AiUsageHistory";
import Advisor from "./pages/Advisor";
import Household from "./pages/Household";
import AppShell from "./components/AppShell";
import { ProtectedRoute, OwnerRoute } from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import Disclaimer from "./pages/legal/Disclaimer";
import Cookies from "./pages/legal/Cookies";
import Install from "./pages/Install";
import { ConsentBanner } from "./components/ConsentBanner";
import { AutoTranslate } from "./lib/autoTranslate";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
        <FeatureFlagsProvider>
        <PortfoliosProvider>
        <ConsentBanner />
        <AutoTranslate />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/signup" element={<Navigate to="/auth?tab=signup" replace />} />
          <Route path="/signup/trial" element={<SignupTrial />} />
          <Route path="/signup/trial/return" element={<SignupTrialReturn />} />
          <Route path="/reactivate" element={<Reactivate />} />
          <Route path="/r/:code" element={<RedeemReferral />} />
          <Route path="/redeem" element={<RedeemReferral />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/install" element={<Install />} />
          <Route path="/support" element={<Support />} />
          <Route path="/ai-stocks-to-watch" element={<AIStocksToWatch />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/features" element={<Features />} />
          <Route path="/contact-sales" element={<ContactSales />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Index />} />
            <Route path="/sentiment" element={<SentimentDashboard />} />
            <Route path="/backtest" element={<BacktestingModule />} />
            <Route path="/backtesting" element={<Navigate to="/backtest" replace />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/net-worth" element={<NetWorth />} />
            <Route path="/net-worth/:category" element={<NetWorthCategory />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/themes" element={<ExploreThemes />} />
            <Route path="/explore/themes/company/:symbol" element={<ThematicCompanyDrilldown />} />
            <Route path="/movers" element={<Movers />} />
            <Route path="/paper-trading" element={<PaperTrading />} />
            <Route path="/options" element={<OptionsChain />} />
            <Route path="/options/:symbol" element={<OptionsChain />} />
            <Route path="/futures" element={<Futures />} />
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
            <Route path="/simulations" element={<PortfolioSimulations />} />
            <Route path="/event-study" element={<EventStudy />} />
            <Route path="/tax-harvest" element={<TaxHarvest />} />
            <Route path="/tax" element={<Navigate to="/tax-harvest" replace />} />
            <Route path="/net-worth/watches" element={<Navigate to="/net-worth/collectibles" replace />} />
            <Route path="/net-worth/watches_collectibles" element={<Navigate to="/net-worth/collectibles" replace />} />
            <Route path="/net-worth/other" element={<Navigate to="/net-worth/other_assets" replace />} />
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
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/security" element={<Security />} />
            <Route path="/ai-scanner" element={<AIScanner />} />
            <Route path="/related" element={<RelatedInstruments />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/suitability" element={<Suitability />} />
            <Route path="/pricing" element={<PricingRedirect />} />
            <Route path="/plans-billing" element={<PlansBilling />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route path="/legal/:kind" element={<LegalDoc />} />
            <Route path="/checkout/return" element={<CheckoutReturn />} />
            <Route path="/dealflow" element={<DealFlow />} />
            <Route path="/privacy-settings" element={<PrivacySettings />} />
            <Route path="/admin/audit" element={<OwnerRoute><AdminAuditLog /></OwnerRoute>} />
            <Route path="/admin/settings" element={<OwnerRoute><AdminSettings /></OwnerRoute>} />
            <Route path="/admin/ai-quotas" element={<OwnerRoute><AdminAiQuotas /></OwnerRoute>} />
            <Route path="/ai-usage" element={<AiUsageHistory />} />
            <Route path="/advisor" element={<Advisor />} />
            <Route path="/household" element={<Household />} />
          </Route>
          <Route path="/owner/*" element={<OwnerRoute><OwnerConsole /></OwnerRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </PortfoliosProvider>
        </FeatureFlagsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
