import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CommandState {
  history: string[];
  favorites: string[];
  addHistory: (cmd: string) => void;
  addFavorite: (cmd: string) => void;
  removeFavorite: (cmd: string) => void;
  clearHistory: () => void;
}

export const useCommandStore = create<CommandState>()(
  persist(
    (set) => ({
      history: [],
      favorites: [],
      addHistory: (cmd) => {
        const c = cmd.trim();
        if (!c) return;
        set((s) => ({
          history: [c, ...s.history.filter((h) => h !== c)].slice(0, 100),
        }));
      },
      addFavorite: (cmd) => {
        const c = cmd.trim();
        if (!c) return;
        set((s) => ({
          favorites: s.favorites.includes(c)
            ? s.favorites
            : [...s.favorites, c],
        }));
      },
      removeFavorite: (cmd) => {
        set((s) => ({ favorites: s.favorites.filter((f) => f !== cmd) }));
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "qookit-commands",
    },
  ),
);
