import { describe, it, expect } from "vitest";
import {
  encodeQuantParam,
  decodeQuantParam,
  type QuantSharePayload,
} from "@/lib/quantShareLink";

/**
 * Regression guard for `?quant=` hydration on /backtest. The encoder/decoder
 * pair must roundtrip every field the panel reads, clamp out-of-range inputs,
 * and reject malformed tokens without throwing.
 */
describe("quantShareLink", () => {
  const payload: Omit<QuantSharePayload, "v"> = {
    s: { horizonDays: 252, paths: 1500, confidences: [0.95, 0.99] },
    h: [
      { symbol: "AAPL", weight: 0.6, name: "Apple Inc." },
      { symbol: "MSFT", weight: 0.4 },
    ],
    range: "5y",
    strategy: "momentum",
  };

  it("roundtrips holdings and settings", () => {
    const token = encodeQuantParam(payload);
    const decoded = decodeQuantParam(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.s).toEqual(payload.s);
    expect(decoded!.h).toEqual(payload.h);
    expect(decoded!.range).toBe("5y");
    expect(decoded!.strategy).toBe("momentum");
  });

  it("clamps horizon and paths into the supported range", () => {
    const token = encodeQuantParam({
      s: { horizonDays: 9999, paths: 99999, confidences: [0.95] },
    });
    const decoded = decodeQuantParam(token)!;
    expect(decoded.s.horizonDays).toBe(1260);
    expect(decoded.s.paths).toBe(10000);
  });

  it("falls back to default confidences when missing", () => {
    const token = encodeQuantParam({
      s: { horizonDays: 252, paths: 1500, confidences: [] },
    });
    const decoded = decodeQuantParam(token)!;
    expect(decoded.s.confidences).toEqual([0.95, 0.99]);
  });

  it("returns null for malformed tokens", () => {
    expect(decodeQuantParam(null)).toBeNull();
    expect(decodeQuantParam("")).toBeNull();
    expect(decodeQuantParam("not-base64-$$$")).toBeNull();
  });
});