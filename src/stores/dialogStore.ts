import { create } from "zustand";

export type DialogType = "alert" | "confirm" | "prompt";

export interface DialogRequest {
  id: string;
  type: DialogType;
  title: string;
  message?: string;
  defaultValue?: string;
  danger?: boolean;
  resolve: (value: boolean | string | null) => void;
}

interface DialogState {
  current: DialogRequest | null;
  open: (req: DialogRequest) => void;
  close: (value: boolean | string | null) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  open: (req) => set({ current: req }),
  close: (value) => {
    const cur = get().current;
    if (cur) cur.resolve(value);
    set({ current: null });
  },
}));
