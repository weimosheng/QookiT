import { create } from "zustand";

export interface ActivityRequest {
  connectionId: string;
  activityId: string;
  timestamp: number;
}

export interface NavigateRequest {
  connectionId: string;
  path: string;
  isDir: boolean;
  timestamp: number;
}

interface NavigationState {
  activityRequest: ActivityRequest | null;
  navigateRequest: NavigateRequest | null;
  requestActivity: (connectionId: string, activityId: string) => void;
  requestNavigate: (
    connectionId: string,
    path: string,
    isDir: boolean,
  ) => void;
  navigateToFile: (
    connectionId: string,
    path: string,
    isDir: boolean,
  ) => void;
  consumeActivityRequest: () => void;
  consumeNavigateRequest: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activityRequest: null,
  navigateRequest: null,
  requestActivity: (connectionId, activityId) =>
    set({ activityRequest: { connectionId, activityId, timestamp: Date.now() } }),
  requestNavigate: (connectionId, path, isDir) =>
    set({
      navigateRequest: { connectionId, path, isDir, timestamp: Date.now() },
    }),
  navigateToFile: (connectionId, path, isDir) =>
    set({
      activityRequest: {
        connectionId,
        activityId: "files",
        timestamp: Date.now(),
      },
      navigateRequest: { connectionId, path, isDir, timestamp: Date.now() },
    }),
  consumeActivityRequest: () => set({ activityRequest: null }),
  consumeNavigateRequest: () => set({ navigateRequest: null }),
}));
