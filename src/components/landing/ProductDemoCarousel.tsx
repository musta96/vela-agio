import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MessageSquare, Sparkles, PieChart, ChevronLeft, ChevronRight } from "lucide-react";
import { trackLandingEvent } from "@/lib/landingAnalytics";

type Slide = {
  eyebrow: string;
  title: string;
  desc: string;
  render: () => JSX.Element;
};

const slides: Slide[] = [
  {
    eyebrow: "01 · Ask",
    title: "Ask a question in plain English",
    desc: "Type any ticker, theme, or thesis. Vela reads the market for you.",
    render: () => (
      <div className="w-full h-full flex flex-col gap-3 p-6">
        <div className="flex items-center gap-2 rounded-2xl border border-[#185FA5]/20 bg-white px-4 py-3 shadow-sm">
          <MessageSquare className="h-4 w-4" style={{ color: "#185FA5" }} />
          <span className="text-sm" style={{ color: "#042C53" }}>
            Is NVDA still a buy after the last earnings?
          </span>
          <span className="ml-auto h-4 w-[2px] animate-pulse" style={{ background: "#1D9E75" }} />
        </div>
        <div className="rounded-2xl bg-[#F1EFE8] px-4 py-3 text-xs" style={{ color: "#042C53" }}>
          <span className="font-bold">Vela</span> is scanning fundamentals, price action, options flow and 14 news sources…
        </div>
      </div>
    ),
  },
  {
    eyebrow: "02 · Signal",
    title: "Get one clear AI signal",
    desc: "Directional call, confidence, and the evidence behind it — in seconds.",
    render: () => (
      <div className="w-full h-full flex flex-col gap-3 p-6">
        <div className="rounded-2xl border border-[#1D9E75]/30 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "#3d4f66" }}>NVDA · Signal</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#1D9E75", color: "#fff" }}>BUY · 82%</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold" style={{ color: "#1D9E75" }}>+9.4% target · 30d</div>
          <div className="mt-2 text-xs leading-relaxed" style={{ color: "#3d4f66" }}>
            Positive earnings surprise, expanding data-center TAM, bullish options skew. Risk: valuation vs peers.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["Fundamentals", "Momentum", "Sentiment"].map((t, i) => (
            <div key={t} className="rounded-xl bg-white border border-[#042C53]/10 px-3 py-2 text-center">
              <div className="text-[9px] font-bold tracking-wider uppercase" style={{ color: "#3d4f66" }}>{t}</div>
              <div className="text-sm font-bold" style={{ color: "#185FA5" }}>{["A", "A-", "B+"][i]}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "03 · Portfolio",
    title: "See what it means for your portfolio",
    desc: "Live exposure, risk and rebalance ideas — synced with your holdings.",
    render: () => (
      <div className="w-full h-full flex flex-col gap-3 p-6">
        <div className="rounded-2xl bg-white border border-[#042C53]/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "#3d4f66" }}>Portfolio</span>
            <span className="text-sm font-bold" style={{ color: "#1D9E75" }}>+2.14% today</span>
          </div>
          <div className="mt-3 h-16 relative overflow-hidden rounded-lg" style={{ background: "linear-gradient(135deg,#185FA5,#1D9E75)" }}>
            <svg viewBox="0 0 200 60" className="w-full h-full">
              <path d="M0,45 L20,38 L40,42 L60,30 L80,32 L100,22 L120,28 L140,18 L160,20 L180,10 L200,14" fill="none" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[#185FA5]/20 p-3 flex items-center gap-3">
          <PieChart className="h-5 w-5" style={{ color: "#185FA5" }} />
          <div className="text-xs" style={{ color: "#042C53" }}>
            <span className="font-bold">Rebalance idea:</span> trim Tech 4%, add Energy 3%.
          </div>
        </div>
      </div>
    ),
  },
];

export function ProductDemoCarousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);
  const regionId = useId();
  const liveId = useId();

  const stopTimer = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    timer.current = window.setInterval(
      () => setI((n) => (n + 1) % slides.length),
      5000,
    );
    return stopTimer;
  }, [paused, stopTimer]);

  // Fire a slide_view analytic each time the active slide changes.
  useEffect(() => {
    trackLandingEvent("landing_demo_slide_view", {
      index: i,
      slide: slides[i].eyebrow,
    });
  }, [i]);

  const go = useCallback(
    (n: number, opts: { pause?: boolean } = {}) => {
      if (opts.pause) setPaused(true);
      setI((n + slides.length) % slides.length);
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1, { pause: true }); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1, { pause: true }); }
    else if (e.key === "Home") { e.preventDefault(); go(0, { pause: true }); }
    else if (e.key === "End") { e.preventDefault(); go(slides.length - 1, { pause: true }); }
  };

  const s = slides[i];

  return (
    <section
      id={regionId}
      aria-roledescription="carousel"
      aria-label="Product demo: what using Vela looks like"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 focus:outline-none"
    >
      <div className="text-center max-w-2xl mx-auto">
        <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>
          <Sparkles className="h-3 w-3 inline mr-1 -mt-0.5" aria-hidden="true" /> See it in 30 seconds
        </div>
        <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
          What using Vela looks like
        </h2>
      </div>

      <div className="mt-10 grid md:grid-cols-[1fr_1.2fr] gap-6 items-stretch">
        {/* Copy */}
        <div
          className="flex flex-col justify-center"
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${slides.length}: ${s.title}`}
        >
          <div className="text-[11px] font-bold tracking-[0.22em] uppercase" style={{ color: "#185FA5" }}>{s.eyebrow}</div>
          <h3 key={s.title} className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
            {s.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed" style={{ color: "#3d4f66" }}>{s.desc}</p>
          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous slide"
              aria-controls={regionId}
              onClick={() => go(i - 1, { pause: true })}
              className="h-11 w-11 rounded-full grid place-items-center border border-[#042C53]/15 bg-white hover:bg-[#F1EFE8] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]"
            >
              <ChevronLeft className="h-4 w-4" style={{ color: "#042C53" }} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              aria-controls={regionId}
              onClick={() => go(i + 1, { pause: true })}
              className="h-11 w-11 rounded-full grid place-items-center border border-[#042C53]/15 bg-white hover:bg-[#F1EFE8] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]"
            >
              <ChevronRight className="h-4 w-4" style={{ color: "#042C53" }} aria-hidden="true" />
            </button>
            <div role="tablist" aria-label="Choose demo slide" className="flex items-center gap-2 ml-3">
              {slides.map((slide, n) => {
                const selected = n === i;
                return (
                  <button
                    key={n}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={regionId}
                    aria-label={`Slide ${n + 1} of ${slides.length}: ${slide.title}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => go(n, { pause: true })}
                    className="h-6 grid place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#185FA5]"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: selected ? 24 : 8,
                        background: selected ? "#185FA5" : "rgba(4,44,83,0.25)",
                        display: "block",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          {/* Live region for screen readers */}
          <span id={liveId} className="sr-only" aria-live="polite">
            Showing slide {i + 1} of {slides.length}: {s.title}
          </span>
        </div>

        {/* Mock screen */}
        <div
          className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/80"
          style={{ background: "linear-gradient(135deg,#F1EFE8,#fff)" }}
          aria-hidden="true"
        >
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#042C53]/10 bg-white/70">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "#3d4f66" }}>vela.ai</span>
          </div>
          <div className="h-[320px] sm:h-[360px]">{s.render()}</div>
        </div>
      </div>
    </section>
  );
}

export default ProductDemoCarousel;