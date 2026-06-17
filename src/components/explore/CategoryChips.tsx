import { useNavigate } from "react-router-dom";
import { MORE_LISTS } from "@/data/curatedLists";
import { ASSET_CLASSES } from "@/data/marketTaxonomy";

interface Props { onBrowse: (assetKey: string) => void }

export function CategoryChips({ onBrowse }: Props) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-2">More lists</h3>
        <div className="flex flex-wrap gap-2">
          {MORE_LISTS.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate("/baskets")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card text-sm"
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Browse all</h3>
        <div className="flex flex-wrap gap-2">
          {ASSET_CLASSES.map((c) => (
            <button
              key={c.key}
              onClick={() => onBrowse(c.key)}
              className="px-3 py-1.5 rounded-full border border-border text-sm hover:bg-muted/40"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}