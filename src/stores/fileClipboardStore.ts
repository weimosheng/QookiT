import { create } from "zustand";

export interface FileClipboard {
  connectionId: string;
  path: string;
  name: string;
  isDir: boolean;
  cut: boolean;
}

interface FileClipboardState {
  clipboard: FileClipboard | null;
  set: (clip: FileClipboard | null) => void;
  clear: () => void;
}

export const useFileClipboardStore = create<FileClipboardState>((set) => ({
  clipboard: null,
  set: (clip) => set({ clipboard: clip }),
  clear: () => set({ clipboard: null }),
}));
