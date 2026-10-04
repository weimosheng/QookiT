import { create } from "zustand";
import type { CloseAction } from "./settingsStore";

interface CloseDialogState {
  resolve: ((action: CloseAction | null) => void) | null;
  open: (resolve: (action: CloseAction | null) => void) => void;
  close: (action: CloseAction | null) => void;
}

export const useCloseDialogStore = create<CloseDialogState>((set, get) => ({
  resolve: null,
  open: (resolve) => set({ resolve }),
  close: (action) => {
    const r = get().resolve;
    if (r) r(action);
    set({ resolve: null });
  },
}));
