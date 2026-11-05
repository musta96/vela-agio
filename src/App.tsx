import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import StockDetails from "./pages/StockDetails";
import FundDetails from "./pages/FundDetails";
import SentimentDashboard from "./pages/SentimentDashboard";
import BacktestingModule from "./pages/BacktestingModule";
import StrategyLab from "./pages/StrategyLab";
import Portfolio from "./pages/Portfolio";
import PortfolioOverview from "./pages/PortfolioOverview";
import Watchlist from "./pages/Watchlist";
import StartupWatchlist from "./pages/StartupWatchlist";
import StartupPortfolio from "./pages/StartupPortfolio";
import StartupScreener from "./pages/StartupScreener";
import PrivateEquity from "./pages/PrivateEquity";

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
import AdminGatingTelemetry from "./pages/AdminGatingTelemetry";
import Alerts from "./pages/Alerts";
import Risk from "./pages/Risk";
import Screener from "./pages/Screener";
import Baskets from "./pages/Baskets";
import Filings from "./pages/Filings";
import ResearchAnalyst from "./pages/ResearchAnalyst";
import Earnings from "./pages/Earnings";
import Insider from "./pages/Insider";
import Macro from "./pages/Macro";
import CreditSpreads from "./pages/CreditSpreads";
import BuybackAnalyzer from "./pages/BuybackAnalyzer";
import BondCalculator from "./pages/BondCalculator";
import ETFOverlap from "./pages/ETFOverlap";
import HedgeFundReplicator from "./pages/HedgeFundReplicator";
import Copilot from "./pages/Copilot";
import Goals from "./pages/Goals";
import DividendPlanner from "./pages/DividendPlanner";
import Budget from "./pages/Budget";
import PortfolioSimulations from "./pages/PortfolioSimulations";
import AdvancedAnalysis from "./pages/AdvancedAnalysis";
import RegulatoryAnalysis from "./pages/RegulatoryAnalysis";
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
import Trading from "./pages/Trading";
import { NoPurchaseRoute } from "@/components/PurchaseUi";
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
import ShortSelling from "./pages/ShortSelling";
import RegionalMarkets from "./pages/RegionalMarkets";
import PortfolioCompare from "./pages/PortfolioCompare";
import FullAnalysis from "./pages/FullAnalysis";
import Valuation from "./pages/Valuation";
import OwnerConsole from "./pages/OwnerConsole";
import EnterpriseTeams from "./pages/owner/EnterpriseTeams";
import EnterpriseFirmDashboard from "./pages/EnterpriseFirmDashboard";
import EnterpriseClientPortal from "./pages/EnterpriseClientPortal";
import JoinEnterpriseTeam from "./pages/JoinEnterpriseTeam";
import RedeemReferral from "./pages/RedeemReferral";
import Blog from "./pages/Blog";
import InvestorCalculator from "./pages/InvestorCalculator";
import FriendInvite from "./pages/FriendInvite";
import Referrals from "./pages/Referrals";
import { FriendInviteAttribution } from "./components/FriendInviteAttribution";
import BlogPost from "./pages/BlogPost";
import SharedResearchNote from "./pages/SharedResearchNote";
import OAuthConsent from "./pages/OAuthConsent";
import AgentIntegrations from "./pages/AgentIntegrations";
import { AuthProvider } from "./hooks/useAuth";
import { FeatureFlagsProvider } from "./hooks/useFeatureFlags";
import { PortfoliosProvider } from "./hooks/usePortfolios";
import { ThemeProvider } from "./hooks/useTheme";
import { PrivacyModeProvider } from "./hooks/usePrivacyMode";
import { NativePushRegistrar } from "./components/NativePushRegistrar";
import AdminSettings from "./pages/AdminSettings";
import AdminAiQuotas from "./pages/AdminAiQuotas";
import AiUsageHistory from "./pages/AiUsageHistory";
import Advisor from "./pages/Advisor";
import Household from "./pages/Household";
import AppShell from "./components/AppShell";
import { ProtectedRoute, OwnerRoute } from "./components/ProtectedRoute";
import { RouteFeatureGate } from "./components/gating/RouteFeatureGate";
import ScrollToTop from "./components/ScrollToTop";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import Disclaimer from "./pages/legal/Disclaimer";
import Cookies from "./pages/legal/Cookies";
import Install from "./pages/Install";
import IosApp from "./pages/IosApp";
import { ConsentBanner } from "./components/ConsentBanner";

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
        <PrivacyModeProvider>
        <NativePushRegistrar />
        <FriendInviteAttribution />
        <ConsentBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/agent-integrations" element={<AgentIntegrations />} />
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
          <Route path="/ios" element={<IosApp />} />
          <Route path="/support" element={<Support />} />
          <Route path="/ai-stocks-to-watch" element={<AIStocksToWatch />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/calcolatore-pac" element={<InvestorCalculator />} />
          <Route path="/invite/:token" element={<FriendInvite />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/features" element={<Features />} />
          <Route path="/contact-sales" element={<ContactSales />} />
          <Route path="/research/shared/:token" element={<SharedResearchNote />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Index />} />
            <Route path="/sentiment" element={<RouteFeatureGate feature="ai.sentiment"><SentimentDashboard /></RouteFeatureGate>} />
            <Route path="/backtest" element={<RouteFeatureGate feature="ai.backtests"><BacktestingModule /></RouteFeatureGate>} />
            <Route path="/backtesting" element={<Navigate to="/backtest" replace />} />
            <Route path="/strategy-lab" element={<RouteFeatureGate feature="strategy.proposal_builder"><StrategyLab /></RouteFeatureGate>} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/overview" element={<PortfolioOverview />} />
            <Route path="/net-worth" element={<NetWorth />} />
            <Route path="/net-worth/:category" element={<NetWorthCategory />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/startups" element={<StartupWatchlist />} />
            <Route path="/startup-portfolio" element={<StartupPortfolio />} />
            <Route path="/startup-screener" element={<StartupScreener />} />
            <Route path="/private-equity" element={<PrivateEquity />} />

            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/themes" element={<ExploreThemes />} />
            <Route path="/explore/themes/company/:symbol" element={<ThematicCompanyDrilldown />} />
            <Route path="/movers" element={<Movers />} />
            <Route path="/trading" element={<Trading />} />
            <Route path="/paper-trading" element={<Navigate to="/trading?tab=paper" replace />} />
            <Route path="/short-selling" element={<ShortSelling />} />
            <Route path="/options" element={<OptionsChain />} />
            <Route path="/options/:symbol" element={<OptionsChain />} />
            <Route path="/futures" element={<Futures />} />
            <Route path="/picks" element={<SmartPicks />} />
            <Route path="/technical" element={<TechnicalAnalysis />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/sectors" element={<SectorHeatmap />} />
            <Route path="/stock/:symbol" element={<StockDetails />} />
            <Route path="/fund/:symbol" element={<FundDetails />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/risk" element={<RouteFeatureGate feature="portfolio.stress_test"><Risk /></RouteFeatureGate>} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/baskets" element={<Baskets />} />
            <Route path="/filings" element={<Filings />} />
            <Route path="/research-analyst" element={<ResearchAnalyst />} />
            <Route path="/earnings" element={<Earnings />} />
            <Route path="/insider" element={<Insider />} />
            <Route path="/macro" element={<Macro />} />
            <Route path="/credit-spreads" element={<CreditSpreads />} />
            <Route path="/buybacks" element={<BuybackAnalyzer />} />
            <Route path="/bonds" element={<BondCalculator />} />
            <Route path="/etf-overlap" element={<ETFOverlap />} />
            <Route path="/replicate" element={<HedgeFundReplicator />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/dividends" element={<DividendPlanner />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/simulations" element={<RouteFeatureGate feature="portfolio.simulations"><PortfolioSimulations /></RouteFeatureGate>} />
            <Route path="/advanced-analysis" element={<AdvancedAnalysis />} />
            <Route path="/regional-markets" element={<RegionalMarkets />} />
            <Route path="/portfolio-compare" element={<PortfolioCompare />} />
            <Route path="/full-analysis" element={<FullAnalysis />} />
            <Route path="/valuation" element={<Valuation />} />
            <Route path="/regulatory-analysis" element={<RegulatoryAnalysis />} />
            <Route path="/event-study" element={<RouteFeatureGate feature="research.event_study"><EventStudy /></RouteFeatureGate>} />
            <Route path="/tax-harvest" element={<RouteFeatureGate feature="tax.harvest"><TaxHarvest /></RouteFeatureGate>} />
            <Route path="/tax" element={<Navigate to="/tax-harvest" replace />} />
            <Route path="/net-worth/watches" element={<Navigate to="/net-worth/collectibles" replace />} />
            <Route path="/net-worth/watches_collectibles" element={<Navigate to="/net-worth/collectibles" replace />} />
            <Route path="/net-worth/other" element={<Navigate to="/net-worth/other_assets" replace />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/learn" element={<Education />} />
            <Route path="/api" element={<RouteFeatureGate feature="enterprise.api"><ApiDocs /></RouteFeatureGate>} />
            <Route path="/intraday" element={<Intraday />} />
            <Route path="/corporate-actions" element={<CorporateActions />} />
            <Route path="/optimizer" element={<RouteFeatureGate feature="portfolio.optimizer"><Optimizer /></RouteFeatureGate>} />
            <Route path="/rebalance" element={<RouteFeatureGate feature="portfolio.rebalance"><Rebalance /></RouteFeatureGate>} />
            <Route path="/peers" element={<Peers />} />
            <Route path="/quant" element={<RouteFeatureGate feature="quant.alpha"><QuantAlpha /></RouteFeatureGate>} />
            <Route path="/blotter" element={<Navigate to="/trading?tab=journal" replace />} />
            <Route path="/orders" element={<Navigate to="/trading?tab=orders" replace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/referrals" element={<Referrals />} />
            <Route path="/security" element={<Security />} />
            <Route path="/ai-scanner" element={<AIScanner />} />
            <Route path="/related" element={<RelatedInstruments />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/suitability" element={<Suitability />} />
            <Route path="/pricing" element={<NoPurchaseRoute><PricingRedirect /></NoPurchaseRoute>} />
            <Route path="/plans-billing" element={<PlansBilling />} />
            <Route path="/upgrade" element={<NoPurchaseRoute to="/plans-billing"><Upgrade /></NoPurchaseRoute>} />
            <Route path="/legal/:kind" element={<LegalDoc />} />
            <Route path="/checkout/return" element={<CheckoutReturn />} />
            <Route path="/dealflow" element={<RouteFeatureGate feature="dealflow.access"><DealFlow /></RouteFeatureGate>} />
            <Route path="/privacy-settings" element={<PrivacySettings />} />
            <Route path="/admin/audit" element={<OwnerRoute><AdminAuditLog /></OwnerRoute>} />
            <Route path="/admin/gating-telemetry" element={<OwnerRoute><AdminGatingTelemetry /></OwnerRoute>} />
            <Route path="/admin/settings" element={<OwnerRoute><AdminSettings /></OwnerRoute>} />
            <Route path="/admin/ai-quotas" element={<OwnerRoute><AdminAiQuotas /></OwnerRoute>} />
            <Route path="/ai-usage" element={<AiUsageHistory />} />
             <Route path="/advisor" element={<RouteFeatureGate feature="portfolio.doctor"><Advisor /></RouteFeatureGate>} />
             <Route path="/enterprise/team" element={<RouteFeatureGate feature="enterprise.team_management"><EnterpriseTeams /></RouteFeatureGate>} />
             <Route path="/enterprise/dashboard" element={<RouteFeatureGate feature="enterprise.team_management"><EnterpriseFirmDashboard /></RouteFeatureGate>} />
             <Route path="/enterprise/clients" element={<RouteFeatureGate feature="enterprise.team_management"><EnterpriseClientPortal /></RouteFeatureGate>} />
             <Route path="/join-team" element={<JoinEnterpriseTeam />} />
             <Route path="/household" element={<Household />} />
          </Route>
          <Route path="/owner/*" element={<OwnerRoute><OwnerConsole /></OwnerRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </PrivacyModeProvider>
        </PortfoliosProvider>
        </FeatureFlagsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
