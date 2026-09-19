import { create } from "zustand";

interface TerminalActiveState {
  activeByConnection: Record<string, string>;
  setActive: (connectionId: string, terminalId: string) => void;
}

export const useTerminalActiveStore = create<TerminalActiveState>((set) => ({
  activeByConnection: {},
  setActive: (connectionId, terminalId) =>
    set((s) => ({
      activeByConnection: { ...s.activeByConnection, [connectionId]: terminalId },
    })),
}));
