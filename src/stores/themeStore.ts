import { create } from "zustand";

interface ThemeState {
  dark: boolean;
  toggle: () => void;
  init: () => void;
}

function applyDark(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  dark: false,
  toggle: () => {
    const next = !get().dark;
    applyDark(next);
    localStorage.setItem("qookit-theme", next ? "dark" : "light");
    set({ dark: next });
  },
  init: () => {
    const saved = localStorage.getItem("qookit-theme");
    const dark = saved === "dark";
    applyDark(dark);
    set({ dark });
  },
}));
