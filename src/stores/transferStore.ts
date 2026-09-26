import { create } from "zustand";

export interface TransferTask {
  id: string;
  connectionId: string;
  direction: "download" | "upload";
  filename: string;
  remotePath: string;
  localPath: string;
  transferred: number;
  total: number;
  status: "pending" | "active" | "done" | "error";
  error: string | null;
}

interface TransferState {
  tasks: TransferTask[];
  addTask: (task: TransferTask) => void;
  updateTask: (id: string, partial: Partial<TransferTask>) => void;
  removeTask: (id: string) => void;
  clearDone: () => void;
}

export const useTransferStore = create<TransferState>((set) => ({
  tasks: [],
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (id, partial) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    })),
  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  clearDone: () =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.status !== "done") })),
}));
