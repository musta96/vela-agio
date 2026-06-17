import { useState } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  MessageCircle,
  Search,
  ChevronRight,
  ExternalLink,
  Send,
} from "lucide-react";
import { toast } from "sonner";

const faqs = [
  {
    question: "What is Vela and who is it for?",
    answer:
      "Vela is an AI-powered investment research and portfolio intelligence platform built for active investors, traders, and financial advisors. We unify real-time market data, sentiment analysis, backtesting, and fundamental screening into one seamless workspace.",
  },
  {
    question: "Is Vela a broker? Can I trade directly in the app?",
    answer:
      "No — Vela is a research and analytics platform, not a broker-dealer. You cannot execute trades directly within the app. We provide signals, screeners, and insights to inform your decisions, which you then execute through your existing brokerage account.",
  },
  {
    question: "Which markets and asset classes does Vela cover?",
    answer:
      "Vela covers major equity markets including FTSE MIB, European exchanges (Xetra, Euronext, LSE), and US markets (NYSE, NASDAQ). We support stocks, ETFs, and indices, with data sourced from Yahoo Finance via secure CORS proxies.",
  },
  {
    question: "How does the AI Copilot work?",
    answer:
      "The AI Copilot analyzes your portfolio, market trends, and news sentiment to generate personalized research briefings, trade ideas, and risk alerts. It runs on Lovable Cloud edge functions and never stores your brokerage credentials.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. We use Supabase with Row-Level Security (RLS), encrypted connections, and strict access controls. We do not sell or share your personal data. You can review our full Privacy Policy and Terms of Use for details.",
  },
  {
    question: "Do you offer paper trading or simulated portfolios?",
    answer:
      "Yes. Vela includes a paper trading module where you can test strategies with virtual capital, track simulated performance, and validate ideas before committing real money.",
  },
  {
    question: "What subscription plans are available?",
    answer:
      "We offer a free tier with core screening and watchlist features, plus premium plans that unlock AI Copilot, advanced backtesting, real-time alerts, and unlimited portfolio tracking. Visit the Pricing page in the app for current plans.",
  },
  {
    question: "How do I cancel or change my subscription?",
    answer:
      "You can manage your subscription anytime from Settings → Billing in the app. Cancellations take effect at the end of the current billing period. If you subscribed via the App Store, you must cancel through your Apple ID subscriptions.",
  },
  {
    question: "Can I export my portfolio data?",
    answer:
      "Yes. Premium users can export portfolio holdings, transaction history, and performance reports in CSV format from the Portfolio and Blotter pages.",
  },
  {
    question: "How do I report a bug or request a feature?",
    answer:
      "Use the contact form on this page or email us directly at support@vela.agio. We review every submission and typically respond within 24–48 hours during business days.",
  },
];

export default function Support() {
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const filteredFaqs = query.trim()
    ? faqs.filter(
        (f) =>
          f.question.toLowerCase().includes(query.toLowerCase()) ||
          f.answer.toLowerCase().includes(query.toLowerCase())
      )
    : faqs;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    setSending(true);
    // Simulate submission — no backend endpoint yet
    await new Promise((r) => setTimeout(r, 1200));
    toast.success("Message sent! We'll get back to you within 24–48 hours.");
    setName("");
    setEmail("");
    setMessage("");
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface-glass/70 border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <LogoMark className="w-7 h-7" />
            <span className="font-semibold text-lg tracking-tight">Vela</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="text-sm">
                Sign In
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="text-sm bg-primary text-primary-foreground hover:bg-primary/90">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 md:py-14">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            How can we help?
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Search our knowledge base, browse FAQs, or reach out to the Vela support team.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search FAQs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-surface-glass-soft border-border/50 focus-visible:ring-primary/30"
          />
        </div>

        {/* Contact cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          <a
            href="mailto:support@vela.agio"
            className="group flex items-start gap-4 p-5 rounded-2xl border border-border/50 bg-surface-glass-soft backdrop-blur-md hover:border-primary/30 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                Email Support
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Reach us at{" "}
                <span className="text-primary font-medium">support@vela.agio</span>
                <br />
                Response time: 24–48 hours
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </a>

          <a
            href="https://vela.agio"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 p-5 rounded-2xl border border-border/50 bg-surface-glass-soft backdrop-blur-md hover:border-primary/30 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ExternalLink className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                Website
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Visit{" "}
                <span className="text-primary font-medium">vela.agio</span>
                <br />
                For updates, blog, and announcements
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </a>
        </div>

        {/* FAQ */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Frequently Asked Questions
          </h2>
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No results for "{query}". Try a different keyword or contact us directly.
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {filteredFaqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="rounded-xl border border-border/50 bg-surface-glass-soft backdrop-blur-md px-5 data-[state=open]:border-primary/20"
                >
                  <AccordionTrigger className="text-left text-sm font-medium py-4 hover:no-underline hover:text-primary transition-colors">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>

        {/* Contact form */}
        <div className="rounded-2xl border border-border/50 bg-surface-glass-soft backdrop-blur-md p-6 md:p-8">
          <h2 className="text-xl font-semibold mb-2">Still need help?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Fill out the form below and our team will get back to you as soon as possible.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="rounded-xl bg-surface-glass border-border/50 focus-visible:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-xl bg-surface-glass border-border/50 focus-visible:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue or question..."
                rows={5}
                className="rounded-xl bg-surface-glass border-border/50 focus-visible:ring-primary/30 resize-none"
              />
            </div>
            <Button
              type="submit"
              disabled={sending}
              className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
              {sending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Send Message
                </span>
              )}
            </Button>
          </form>
        </div>

        {/* Footer links */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <span className="text-border">•</span>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Use</Link>
          <span className="text-border">•</span>
          <Link to="/disclaimer" className="hover:text-primary transition-colors">Disclaimer</Link>
          <span className="text-border">•</span>
          <Link to="/cookies" className="hover:text-primary transition-colors">Cookies</Link>
        </div>
      </main>
    </div>
  );
}
