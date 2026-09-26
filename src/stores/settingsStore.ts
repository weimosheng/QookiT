import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsValues {
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalScrollback: number;
  terminalCols: number;
  terminalRows: number;
  editorFontSize: number;
  editorTabSize: number;
  editorWordWrap: boolean;
  defaultPort: number;
  defaultUsername: string;
  hiddenTools: string[];
}

export interface SettingsState extends SettingsValues {
  update: (partial: Partial<SettingsValues>) => void;
}

const DEFAULTS: SettingsValues = {
  terminalFontFamily: "Consolas, Monaco, 'Courier New', monospace",
  terminalFontSize: 14,
  terminalScrollback: 1000,
  terminalCols: 80,
  terminalRows: 24,
  editorFontSize: 13,
  editorTabSize: 2,
  editorWordWrap: false,
  defaultPort: 22,
  defaultUsername: "root",
  hiddenTools: [],
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (partial) => set(partial),
    }),
    {
      name: "qookit-settings",
    },
  ),
);
