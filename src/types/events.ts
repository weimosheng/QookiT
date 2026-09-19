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
