import { invoke } from "@tauri-apps/api/core";

export const terminalService = {
  open: (connectionId: string, cols: number, rows: number) =>
    invoke<string>("open_terminal", { connectionId, cols, rows }),
  write: (connectionId: string, terminalId: string, data: string) =>
    invoke<void>("terminal_write", { connectionId, terminalId, data }),
  resize: (connectionId: string, terminalId: string, cols: number, rows: number) =>
    invoke<void>("terminal_resize", { connectionId, terminalId, cols, rows }),
  close: (connectionId: string, terminalId: string) =>
    invoke<void>("close_terminal", { connectionId, terminalId }),
};
