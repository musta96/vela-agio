import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";

const LANGS = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
];

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const current = LANGS.find(l => l.code === i18n.resolvedLanguage) ?? LANGS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-2 py-1 hover:text-primary hover:border-primary/40" title="Language">
        <Languages className="h-3 w-3" /> {current.flag}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map(l => (
          <DropdownMenuItem key={l.code} onClick={() => i18n.changeLanguage(l.code)}>
            <span className="mr-2">{l.flag}</span>{l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};