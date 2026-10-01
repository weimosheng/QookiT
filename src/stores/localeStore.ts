import { create } from "zustand";
import { locale as osLocale } from "@tauri-apps/plugin-os";
import i18n, {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "../lib/i18n";

const STORAGE_KEY = "qookit-locale";

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function mapRawLocale(raw: string): Locale {
  return raw.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function detectFromNavigator(): Locale {
  return mapRawLocale(navigator.language ?? "");
}

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  void i18n.changeLanguage(locale);
}

interface LocaleState {
  locale: Locale;
  mode: "auto" | "manual";
  setLocale: (locale: Locale) => void;
  setAuto: () => void;
  init: () => void;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: DEFAULT_LOCALE,
  mode: "auto",
  setLocale: (locale) => {
    applyLocale(locale);
    localStorage.setItem(STORAGE_KEY, locale);
    set({ locale, mode: "manual" });
  },
  setAuto: () => {
    localStorage.removeItem(STORAGE_KEY);
    const fallback = detectFromNavigator();
    applyLocale(fallback);
    set({ locale: fallback, mode: "auto" });
    void osLocale()
      .then((raw) => {
        if (!raw) return;
        const mapped = mapRawLocale(raw);
        if (mapped === get().locale) return;
        applyLocale(mapped);
        set({ locale: mapped });
      })
      .catch(() => {});
  },
  init: () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLocale(saved)) {
      applyLocale(saved);
      set({ locale: saved, mode: "manual" });
      return;
    }
    const fallback = detectFromNavigator();
    applyLocale(fallback);
    set({ locale: fallback, mode: "auto" });
    void osLocale()
      .then((raw) => {
        if (!raw) return;
        const mapped = mapRawLocale(raw);
        if (mapped === get().locale) return;
        applyLocale(mapped);
        set({ locale: mapped });
      })
      .catch(() => {});
  },
}));
