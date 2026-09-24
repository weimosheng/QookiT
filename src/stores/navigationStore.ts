import { create } from "zustand";

export interface NavigateRequest {
  connectionId: string;
  path: string;
  isDir: boolean;
  timestamp: number;
}

interface NavigationState {
  navigateRequest: NavigateRequest | null;
  requestNavigate: (
    connectionId: string,
    path: string,
    isDir: boolean,
  ) => void;
  consumeNavigateRequest: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  navigateRequest: null,
  requestNavigate: (connectionId, path, isDir) =>
    set({
      navigateRequest: { connectionId, path, isDir, timestamp: Date.now() },
    }),
  consumeNavigateRequest: () => set({ navigateRequest: null }),
}));
