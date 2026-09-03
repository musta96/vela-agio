import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import it from "./it.json";

// One-time purge of the legacy runtime AI-translation cache (`i18n-auto:*`).
// UI copy is now fully static; that cache only produced mixed-language,
// unstable and mis-spaced text.
function purgeLegacyAutoTranslateCache() {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("i18n-auto:")) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* private mode */
  }
}

purgeLegacyAutoTranslateCache();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, it: { translation: it } },
    fallbackLng: "en",
    supportedLngs: ["en", "it"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

// Keep <html lang> in sync with the active locale.
function syncHtmlLang(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = (lng || "en").split("-")[0];
}
syncHtmlLang(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
