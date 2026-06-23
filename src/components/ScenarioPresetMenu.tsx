import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bookmark, Save, Share2, Trash2 } from "lucide-react";
import {
  type PresetPayload,
  type PresetScope,
  type ScenarioPreset,
  buildShareableUrl,
  deletePreset,
  listPresets,
  savePreset,
} from "@/lib/scenarioPresets";
import { toast } from "sonner";

/**
 * Compact Save / Load / Delete control for scenario presets.
 * Used by `MacroScenarioLab` (scope = "macro") and the Goals Monte Carlo
 * panel (scope = "mc"). Pure UI — persistence lives in `scenarioPresets`.
 */
export interface ScenarioPresetMenuProps<S extends PresetScope> {
  scope: S;
  current: PresetPayload<S>;
  onLoad: (payload: PresetPayload<S>, preset: ScenarioPreset<S>) => void;
  className?: string;
}

export function ScenarioPresetMenu<S extends PresetScope>({ scope, current, onLoad, className }: ScenarioPresetMenuProps<S>) {
  const [presets, setPresets] = useState<ScenarioPreset<S>[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const refresh = () => setPresets(listPresets(scope));
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope]);

  const sorted = useMemo(() => [...presets].sort((a, b) => b.createdAt - a.createdAt), [presets]);

  const handleLoad = (id: string) => {
    setSelectedId(id);
    const p = sorted.find((x) => x.id === id);
    if (p) {
      onLoad(p.payload, p);
      toast.success(`Loaded "${p.name}"`);
    }
  };

  const handleSave = () => {
    const label = name.trim();
    if (!label) { toast.error("Give your preset a name"); return; }
    const saved = savePreset(scope, label, current);
    setName("");
    setOpen(false);
    refresh();
    setSelectedId(saved.id);
    toast.success(`Saved "${saved.name}"`);
  };

  const handleDelete = () => {
    if (!selectedId) return;
    const p = sorted.find((x) => x.id === selectedId);
    deletePreset(scope, selectedId);
    setSelectedId("");
    refresh();
    if (p) toast.success(`Deleted "${p.name}"`);
  };

  const handleShare = async () => {
    const selected = sorted.find((x) => x.id === selectedId);
    const url = buildShareableUrl(scope, current, selected?.name);
    if (!url) { toast.error("Sharing not supported in this context"); return; }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", { description: "Anyone with this link will load the same scenario." });
    } catch {
      // Fallback: surface the URL in a prompt-like toast so the user can copy manually.
      toast.info(url);
    }
  };

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Select value={selectedId} onValueChange={handleLoad}>
        <SelectTrigger className="h-8 text-xs w-[160px]">
          <Bookmark className="h-3.5 w-3.5 mr-1.5 shrink-0" />
          <SelectValue placeholder="Load preset" />
        </SelectTrigger>
        <SelectContent>
          {sorted.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No presets saved yet.</div>
          ) : sorted.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              {p.name}
              <span className="ml-2 text-[10px] text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-2" align="end">
          <div className="text-xs font-medium">Save current settings as a preset</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. House-view stress · 99% CVaR"
            className="h-8 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} className="h-7 text-xs">Save</Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Saved locally in this browser. Same name overwrites.
          </p>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        onClick={handleShare}
        title="Copy a shareable link that reproduces these settings"
      >
        <Share2 className="h-3.5 w-3.5" /> Share
      </Button>
      {selectedId && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          title="Delete selected preset"
          aria-label="Delete preset"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export default ScenarioPresetMenu;