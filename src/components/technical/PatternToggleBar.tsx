import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Eye, EyeOff } from "lucide-react";

export interface OverlayToggles {
  sr: boolean;
  trendlines: boolean;
  fvg: boolean;
  orderBlocks: boolean;
  supplyDemand: boolean;
  liquidity: boolean;
  candles: boolean;
  chartPatterns: boolean;
  structure: boolean;
}

export const DEFAULT_TOGGLES: OverlayToggles = {
  sr: true,
  trendlines: true,
  fvg: true,
  orderBlocks: true,
  supplyDemand: false,
  liquidity: true,
  candles: true,
  chartPatterns: true,
  structure: true,
};

interface Props {
  toggles: OverlayToggles;
  counts: Partial<Record<keyof OverlayToggles, number>>;
  onChange: (t: OverlayToggles) => void;
}

const LABELS: { key: keyof OverlayToggles; label: string }[] = [
  { key: "sr", label: "S/R levels" },
  { key: "trendlines", label: "Trendlines" },
  { key: "candles", label: "Candle patterns" },
  { key: "chartPatterns", label: "Chart patterns" },
  { key: "fvg", label: "Fair Value Gaps" },
  { key: "orderBlocks", label: "Order blocks" },
  { key: "supplyDemand", label: "Supply/Demand" },
  { key: "liquidity", label: "Liquidity grabs" },
  { key: "structure", label: "Market structure" },
];

export function PatternToggleBar({ toggles, counts, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Overlays:</span>
      {LABELS.map(({ key, label }) => (
        <Toggle
          key={key}
          size="sm"
          pressed={toggles[key]}
          onPressedChange={(v) => onChange({ ...toggles, [key]: v })}
          className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          aria-label={`Toggle ${label}`}
        >
          {toggles[key] ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
          {label}
          {counts[key] != null && counts[key]! > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{counts[key]}</Badge>
          )}
        </Toggle>
      ))}
    </div>
  );
}