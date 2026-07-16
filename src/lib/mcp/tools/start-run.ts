import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withInstrumentation } from "../lib/instrument";
import { fetchHistory, simulate, type BacktestParams, type Preset } from "../lib/backtest";

function sbUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const BacktestInput = z.object({
  symbol: z.string().min(1),
  preset: z.enum(["buy_hold", "sma_cross", "rsi"]).default("sma_cross"),
  range: z.enum(["6mo", "1y", "2y", "5y", "10y", "max"]).default("2y"),
  initial_capital: z.number().positive().max(10_000_000).default(10_000),
  fast: z.number().int().min(2).max(200).optional(),
  slow: z.number().int().min(3).max(400).optional(),
  rsi_period: z.number().int().min(2).max(50).optional(),
  rsi_buy: z.number().min(1).max(99).optional(),
  rsi_sell: z.number().min(1).max(99).optional(),
  stop_pct: z.number().min(0).max(100).optional(),
  target_pct: z.number().min(0).max(500).optional(),
});

const SensitivityInput = BacktestInput.extend({
  sweep: z.object({
    fast: z.array(z.number().int().min(2).max(200)).max(12).optional(),
    slow: z.array(z.number().int().min(3).max(400)).max(12).optional(),
    rsi_period: z.array(z.number().int().min(2).max(50)).max(12).optional(),
    rsi_buy: z.array(z.number().min(1).max(99)).max(12).optional(),
    rsi_sell: z.array(z.number().min(1).max(99)).max(12).optional(),
  }).describe("Arrays of parameter values to sweep. Cartesian product is capped at 64 combinations."),
});

export default defineTool({
  name: "start_run",
  title: "Start a backtest or sensitivity run",
  description:
    "Kick off a `backtest` (single-config) or `sensitivity` (parameter sweep) simulation and return a run_id. " +
    "Follow up with `get_run_status`, `get_run_result`, or `get_run_logs`. Requires authentication.",
  inputSchema: {
    kind: z.enum(["backtest", "sensitivity"]).describe("What to run"),
    input: z.record(z.string(), z.any()).describe(
      "For kind='backtest': BacktestInput { symbol, preset, range, initial_capital, fast, slow, rsi_period, rsi_buy, rsi_sell, stop_pct, target_pct }. " +
      "For kind='sensitivity': BacktestInput + `sweep` object with arrays of values for fast/slow/rsi_period/rsi_buy/rsi_sell (max 64 combinations).",
    ),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ kind, input }, ctx: ToolContext) =>
    withInstrumentation("start_run", ctx, async () => {
      if (!ctx.isAuthenticated()) {
        return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
      }
      const sb = sbUser(ctx);
      const userId = ctx.getUserId();
      const logs: Array<{ t: string; level: string; msg: string }> = [];
      const log = (level: string, msg: string) =>
        logs.push({ t: new Date().toISOString(), level, msg });

      const { data: created, error: createErr } = await sb
        .from("simulation_runs")
        .insert({ user_id: userId, kind, input, status: "running", started_at: new Date().toISOString(), progress: 0, logs: [] })
        .select("id")
        .single();
      if (createErr || !created) {
        return { content: [{ type: "text", text: createErr?.message ?? "Failed to create run." }], isError: true };
      }
      const runId = created.id as string;

      const finish = async (patch: Record<string, unknown>) => {
        await sb.from("simulation_runs").update({
          ...patch,
          logs,
          finished_at: new Date().toISOString(),
        }).eq("id", runId).eq("user_id", userId);
      };

      try {
        if (kind === "backtest") {
          const parsed = BacktestInput.safeParse(input);
          if (!parsed.success) {
            log("error", "Invalid backtest input: " + JSON.stringify(parsed.error.flatten().fieldErrors));
            await finish({ status: "failed", error: "invalid input", progress: 100 });
            return { content: [{ type: "text", text: `run_id=${runId} status=failed` }], structuredContent: { run_id: runId, status: "failed" } };
          }
          const args = parsed.data;
          log("info", `Fetching ${args.symbol} history range=${args.range}`);
          const bars = await fetchHistory(args.symbol.toUpperCase(), args.range);
          if (bars.length < 30) {
            log("error", `Insufficient bars (${bars.length}) for ${args.symbol}`);
            await finish({ status: "failed", error: "insufficient_history", progress: 100 });
            return { content: [{ type: "text", text: `run_id=${runId} status=failed` }], structuredContent: { run_id: runId, status: "failed" } };
          }
          log("info", `Loaded ${bars.length} bars — simulating ${args.preset}`);
          const params: BacktestParams = {
            fast: args.fast, slow: args.slow,
            rsiPeriod: args.rsi_period, rsiBuy: args.rsi_buy, rsiSell: args.rsi_sell,
            stopPct: args.stop_pct, targetPct: args.target_pct,
          };
          const metrics = simulate(bars, args.preset as Preset, params, args.initial_capital);
          log("info", `Done. CAGR=${metrics.cagr}% MaxDD=${metrics.maxDrawdown}%`);
          const result = {
            symbol: args.symbol.toUpperCase(), preset: args.preset, range: args.range,
            initial_capital: args.initial_capital, params, metrics,
            start: new Date(bars[0].t).toISOString().slice(0, 10),
            end: new Date(bars[bars.length - 1].t).toISOString().slice(0, 10),
          };
          await finish({ status: "succeeded", progress: 100, result });
          return {
            content: [{ type: "text", text: `run_id=${runId} status=succeeded` }],
            structuredContent: { run_id: runId, status: "succeeded" },
          };
        }

        // sensitivity
        const parsed = SensitivityInput.safeParse(input);
        if (!parsed.success) {
          log("error", "Invalid sensitivity input: " + JSON.stringify(parsed.error.flatten().fieldErrors));
          await finish({ status: "failed", error: "invalid input", progress: 100 });
          return { content: [{ type: "text", text: `run_id=${runId} status=failed` }], structuredContent: { run_id: runId, status: "failed" } };
        }
        const args = parsed.data;
        const sweep = args.sweep ?? {};
        const dims: Array<[string, number[]]> = [];
        if (sweep.fast?.length) dims.push(["fast", sweep.fast]);
        if (sweep.slow?.length) dims.push(["slow", sweep.slow]);
        if (sweep.rsi_period?.length) dims.push(["rsi_period", sweep.rsi_period]);
        if (sweep.rsi_buy?.length) dims.push(["rsi_buy", sweep.rsi_buy]);
        if (sweep.rsi_sell?.length) dims.push(["rsi_sell", sweep.rsi_sell]);

        // Cartesian product
        let combos: Record<string, number>[] = [{}];
        for (const [name, vals] of dims) {
          const next: Record<string, number>[] = [];
          for (const c of combos) for (const v of vals) next.push({ ...c, [name]: v });
          combos = next;
        }
        if (combos.length > 64) {
          log("error", `sweep produced ${combos.length} combinations (max 64)`);
          await finish({ status: "failed", error: "sweep_too_large", progress: 100 });
          return { content: [{ type: "text", text: `run_id=${runId} status=failed` }], structuredContent: { run_id: runId, status: "failed" } };
        }
        log("info", `Fetching ${args.symbol} history range=${args.range}`);
        const bars = await fetchHistory(args.symbol.toUpperCase(), args.range);
        if (bars.length < 30) {
          log("error", `Insufficient bars (${bars.length})`);
          await finish({ status: "failed", error: "insufficient_history", progress: 100 });
          return { content: [{ type: "text", text: `run_id=${runId} status=failed` }], structuredContent: { run_id: runId, status: "failed" } };
        }
        log("info", `Loaded ${bars.length} bars — running ${combos.length} combos`);
        const rows: Array<Record<string, unknown>> = [];
        for (let i = 0; i < combos.length; i++) {
          const c = combos[i];
          const p: BacktestParams = {
            fast: (c.fast as number | undefined) ?? args.fast,
            slow: (c.slow as number | undefined) ?? args.slow,
            rsiPeriod: (c.rsi_period as number | undefined) ?? args.rsi_period,
            rsiBuy: (c.rsi_buy as number | undefined) ?? args.rsi_buy,
            rsiSell: (c.rsi_sell as number | undefined) ?? args.rsi_sell,
            stopPct: args.stop_pct, targetPct: args.target_pct,
          };
          const m = simulate(bars, args.preset as Preset, p, args.initial_capital);
          rows.push({ params: c, metrics: m });
          const progress = Math.round(((i + 1) / combos.length) * 100);
          if (i % 4 === 3 || i === combos.length - 1) {
            await sb.from("simulation_runs").update({ progress, logs }).eq("id", runId).eq("user_id", userId);
          }
        }
        rows.sort((a, b) => ((b.metrics as { cagr: number }).cagr) - ((a.metrics as { cagr: number }).cagr));
        log("info", `Sensitivity complete. Best CAGR=${(rows[0]?.metrics as { cagr: number } | undefined)?.cagr}%`);
        const result = {
          symbol: args.symbol.toUpperCase(), preset: args.preset, range: args.range,
          combinations: rows.length, results: rows,
          best: rows[0] ?? null,
          start: new Date(bars[0].t).toISOString().slice(0, 10),
          end: new Date(bars[bars.length - 1].t).toISOString().slice(0, 10),
        };
        await finish({ status: "succeeded", progress: 100, result });
        return {
          content: [{ type: "text", text: `run_id=${runId} status=succeeded combos=${rows.length}` }],
          structuredContent: { run_id: runId, status: "succeeded", combinations: rows.length },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("error", msg);
        await finish({ status: "failed", error: msg, progress: 100 });
        return { content: [{ type: "text", text: `run_id=${runId} status=failed: ${msg}` }], structuredContent: { run_id: runId, status: "failed", error: msg }, isError: true };
      }
    }, { rateLimit: { max: 10, windowSec: 60 } }),
});