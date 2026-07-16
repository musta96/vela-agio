// Event-driven intraday backtest helpers: aggregate returns and volatility
// expansion around a set of news timestamps.

export interface Bar { t: number; close: number; }
export interface EventStats {
  events: number;
  preAvgRetPct: number;
  postAvgRetPct: number;
  preSigma: number;      // stdev of log-returns in the pre-window (bar scale)
  postSigma: number;     // stdev of log-returns in the post-window
  volExpansion: number;  // postSigma / preSigma
  hitRate: number;       // % events where post return sign matches sentiment
}

function nearest(bars: Bar[], ts: number): number {
  for (let i = 0; i < bars.length; i++) if (bars[i].t >= ts) return i;
  return -1;
}

function sigma(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

export function analyzeEventWindows(
  bars: Bar[],
  events: { publishedAt: number; sentiment: number }[],
  preBars: number,
  postBars: number,
): EventStats {
  const preRets: number[] = [], postRets: number[] = [];
  const preLogs: number[] = [], postLogs: number[] = [];
  let hits = 0, used = 0;
  for (const e of events) {
    const i = nearest(bars, e.publishedAt);
    if (i < preBars || i + postBars >= bars.length) continue;
    used++;
    const preStart = bars[i - preBars].close;
    const preEnd   = bars[i].close;
    const postEnd  = bars[i + postBars].close;
    const preRet   = ((preEnd - preStart) / preStart) * 100;
    const postRet  = ((postEnd - preEnd) / preEnd) * 100;
    preRets.push(preRet); postRets.push(postRet);
    for (let k = i - preBars + 1; k <= i; k++) preLogs.push(Math.log(bars[k].close / bars[k - 1].close));
    for (let k = i + 1; k <= i + postBars; k++) postLogs.push(Math.log(bars[k].close / bars[k - 1].close));
    if (Math.sign(postRet) === Math.sign(e.sentiment) && e.sentiment !== 0) hits++;
  }
  const preSigma = sigma(preLogs), postSigma = sigma(postLogs);
  return {
    events: used,
    preAvgRetPct:  preRets.length ? preRets.reduce((a, b) => a + b, 0) / preRets.length : 0,
    postAvgRetPct: postRets.length ? postRets.reduce((a, b) => a + b, 0) / postRets.length : 0,
    preSigma, postSigma,
    volExpansion: preSigma > 0 ? postSigma / preSigma : 0,
    hitRate: used ? (hits / used) * 100 : 0,
  };
}