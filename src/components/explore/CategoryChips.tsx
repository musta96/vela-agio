import { useNavigate } from "react-router-dom";
import { MORE_LISTS } from "@/data/curatedLists";
import { ASSET_CLASSES } from "@/data/marketTaxonomy";

interface Props { onBrowse: (assetKey: string) => void }

export function CategoryChips({ onBrowse }: Props) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Themes</div>
        <h2 className="text-lg font-semibold mb-3">More lists</h2>
        <div className="flex flex-wrap gap-2">
          {MORE_LISTS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => navigate("/baskets")}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass-card text-sm hover:-translate-y-0.5 transition-transform"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Catalogue</div>
        <h2 className="text-lg font-semibold mb-3">Browse all asset classes</h2>
        <div className="flex flex-wrap gap-2">
          {ASSET_CLASSES.map((c) => (
            <button
              key={c.key}
              onClick={() => onBrowse(c.key)}
              className="px-3.5 py-2 rounded-full border border-border/70 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}