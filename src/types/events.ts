export interface TerminalDataPayload {
  connection_id: string;
  terminal_id: string;
  data: string;
}

export interface TerminalExitPayload {
  connection_id: string;
  terminal_id: string;
  exit_code: number | null;
}

export interface ConnectionLogPayload {
  host_id: string;
  step: string;
  message: string;
  status: string;
}

export const TERMINAL_DATA_EVENT = "terminal:data";
export const TERMINAL_EXIT_EVENT = "terminal:exit";
export const CONNECTION_LOG_EVENT = "connection:log";
export const FILE_READ_PROGRESS_EVENT = "file:read_progress";
export const FILE_TRANSFER_PROGRESS_EVENT = "file:transfer_progress";

export interface FileReadProgressPayload {
  connection_id: string;
  path: string;
  read_bytes: number;
  total_bytes: number;
}

export interface FileTransferProgressPayload {
  transfer_id: string;
  connection_id: string;
  direction: "download" | "upload";
  filename: string;
  transferred: number;
  total: number;
  status: "active" | "done" | "error";
  error: string | null;
}
