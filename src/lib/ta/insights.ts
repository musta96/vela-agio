import type { Bar, ActionableInsight, Bias } from "./types";
import { sma, ema, rsi, macd, atr, volumeStats } from "../technicalIndicators";

// Turn raw indicator values into portfolio-manager style, actionable rows.
export function computeInsights(bars: Bar[]): ActionableInsight[] {
  const out: ActionableInsight[] = [];
  if (bars.length < 60) return out;
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const a = atr(bars, 14);
  const vol = volumeStats(bars);
  const n = closes.length;

  // --- RSI insights ---
  const rNow = r[n - 1];
  const rPrev = r[n - 2];
  if (rNow != null) {
    if (rNow > 70) {
      out.push({
        id: "rsi-overbought", name: "RSI overbought", bias: "bearish",
        confidence: rNow > 80 ? "high" : "medium",
        detail: `RSI(14) at ${rNow.toFixed(1)} — above the 70 overbought threshold.`,
        howToTrade: "Tighten trailing stops or scale out. Only add on a mean-reversion setup back through 70 with bearish price action.",
      });
    } else if (rNow < 30) {
      out.push({
        id: "rsi-oversold", name: "RSI oversold", bias: "bullish",
        confidence: rNow < 20 ? "high" : "medium",
        detail: `RSI(14) at ${rNow.toFixed(1)} — below the 30 oversold threshold.`,
        howToTrade: "Watch for a reversal candle (hammer / bullish engulfing) or an RSI cross back above 30 before entering long.",
      });
    } else if (rPrev != null && rPrev < 50 && rNow >= 50) {
      out.push({
        id: "rsi-cross-mid", name: "RSI reclaimed 50", bias: "bullish", confidence: "low",
        detail: `RSI crossed back above the 50 midline (${rPrev.toFixed(1)} → ${rNow.toFixed(1)}).`,
        howToTrade: "Momentum shift; use pullbacks to the 20 EMA as low-risk entries.",
      });
    }
    // Divergence check: last 20 bars, price higher-high but RSI lower-high.
    const win = 20;
    if (n > win) {
      const priceMaxIdx = closes.slice(-win).reduce((mx, v, i, arr) => v > arr[mx] ? i : mx, 0) + (n - win);
      const rsiWindow = r.slice(-win) as (number | null)[];
      const rsiMax = Math.max(...rsiWindow.map((v) => v ?? -Infinity));
      if (rNow != null && closes[priceMaxIdx] === Math.max(...closes.slice(-win)) && rNow < rsiMax * 0.9) {
        out.push({
          id: "rsi-bear-div", name: "Bearish RSI divergence", bias: "bearish", confidence: "medium",
          detail: "Price made a new 20-bar high while RSI failed to confirm.",
          howToTrade: "Consider taking partial profits or waiting for confirmation before adding new longs.",
        });
      }
    }
  }

  // --- Moving average insights (golden / death cross) ---
  const s50Now = s50[n - 1], s50Prev = s50[n - 20] ?? null;
  const s200Now = s200[n - 1], s200Prev = s200[n - 20] ?? null;
  if (s50Now != null && s200Now != null && s50Prev != null && s200Prev != null) {
    if (s50Prev <= s200Prev && s50Now > s200Now) {
      out.push({
        id: "golden-cross", name: "Golden Cross", bias: "bullish", confidence: "high",
        detail: `SMA50 (${s50Now.toFixed(2)}) has crossed above SMA200 (${s200Now.toFixed(2)}).`,
        howToTrade: "Long-term trend flipped bullish. Buy pullbacks to the 50 SMA; keep stops below the 200 SMA.",
      });
    } else if (s50Prev >= s200Prev && s50Now < s200Now) {
      out.push({
        id: "death-cross", name: "Death Cross", bias: "bearish", confidence: "high",
        detail: `SMA50 (${s50Now.toFixed(2)}) has crossed below SMA200 (${s200Now.toFixed(2)}).`,
        howToTrade: "Long-term trend flipped bearish. Reduce long exposure; rallies to the 50 SMA are shorting opportunities.",
      });
    }
  }

  // Short EMA cross
  const e9Now = e9[n - 1], e9Prev = e9[n - 2];
  const e21Now = e21[n - 1], e21Prev = e21[n - 2];
  if (e9Now != null && e9Prev != null && e21Now != null && e21Prev != null) {
    if (e9Prev <= e21Prev && e9Now > e21Now) {
      out.push({
        id: "ema-9-21-bull", name: "EMA 9/21 bull cross", bias: "bullish", confidence: "medium",
        detail: "Short-term EMA crossed above medium-term EMA — momentum turning up.",
        howToTrade: "Swing entry with stop below the crossover bar's low. Look for confirmation on rising volume.",
      });
    } else if (e9Prev >= e21Prev && e9Now < e21Now) {
      out.push({
        id: "ema-9-21-bear", name: "EMA 9/21 bear cross", bias: "bearish", confidence: "medium",
        detail: "Short-term EMA crossed below medium-term EMA — momentum turning down.",
        howToTrade: "Trim longs; short setup validated on retest of the crossover bar's high.",
      });
    }
  }

  // Price vs SMA20 for near-term trend
  const s20Now = s20[n - 1];
  if (s20Now != null) {
    const dev = ((last - s20Now) / s20Now) * 100;
    if (Math.abs(dev) > 4) {
      out.push({
        id: "sma20-stretch", name: "Stretched from SMA20", bias: dev > 0 ? "bearish" : "bullish",
        confidence: "low",
        detail: `Price is ${dev.toFixed(1)}% ${dev > 0 ? "above" : "below"} the 20 SMA.`,
        howToTrade: dev > 0
          ? "Mean-reversion risk — avoid chasing; wait for a pullback to the 20 SMA."
          : "Snapback potential toward the 20 SMA on any relief bounce.",
      });
    }
  }

  // --- MACD ---
  const mNow = m[n - 1], mPrev = m[n - 2];
  if (mNow?.macd != null && mNow?.signal != null && mPrev?.macd != null && mPrev?.signal != null) {
    if (mPrev.macd <= mPrev.signal && mNow.macd > mNow.signal) {
      const rising = (mNow.hist ?? 0) > (mPrev.hist ?? 0);
      out.push({
        id: "macd-bull-cross", name: "MACD bullish cross", bias: "bullish",
        confidence: rising ? "high" : "medium",
        detail: `MACD ${mNow.macd.toFixed(3)} crossed above signal ${mNow.signal.toFixed(3)}${rising ? " with rising histogram" : ""}.`,
        howToTrade: "Enter on close above the signal cross bar; stop below its low. Target the next resistance level.",
      });
    } else if (mPrev.macd >= mPrev.signal && mNow.macd < mNow.signal) {
      out.push({
        id: "macd-bear-cross", name: "MACD bearish cross", bias: "bearish", confidence: "medium",
        detail: `MACD ${mNow.macd.toFixed(3)} crossed below signal ${mNow.signal.toFixed(3)}.`,
        howToTrade: "Consider trimming or hedging; short entries valid on retest of the cross bar's high.",
      });
    }
  }

  // --- Volume ---
  if (vol) {
    if (vol.spike) {
      const bar = bars[n - 1];
      const bias: Bias = bar.close > bar.open ? "bullish" : "bearish";
      out.push({
        id: "volume-spike", name: "Volume surge", bias, confidence: "medium",
        detail: `Volume ${vol.ratio.toFixed(1)}× the 20-bar average, confirming a ${bias} bar.`,
        howToTrade: bias === "bullish"
          ? "Breakouts with volume confirmation carry higher follow-through odds — enter on the retest of breakout level."
          : "Distribution risk — avoid new longs until price stabilizes on lighter volume.",
      });
    } else if (vol.weak) {
      out.push({
        id: "volume-weak", name: "Weak participation", bias: "neutral", confidence: "low",
        detail: `Volume only ${vol.ratio.toFixed(2)}× the 20-bar average — moves lack conviction.`,
        howToTrade: "Wait for expanding volume before committing size in either direction.",
      });
    }
  }

  // --- ATR context (used by planner) ---
  const aNow = a[n - 1];
  if (aNow != null) {
    out.push({
      id: "atr-context", name: "ATR (14) volatility", bias: "neutral", confidence: "low",
      detail: `Average true range ${aNow.toFixed(2)} (~${((aNow / last) * 100).toFixed(2)}% of price).`,
      howToTrade: "Use ATR to size stops. A 1× ATR stop is normal; < 0.5× ATR usually gets knocked out by noise.",
    });
  }

  return out;
}