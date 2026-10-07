export type ForwardKind = "local" | "remote" | "dynamic";

export interface ForwardSpec {
  kind: ForwardKind;
  local_host: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
}

export interface ForwardInfo {
  id: string;
  spec: ForwardSpec;
  status: "starting" | "active" | "error" | "stopped";
  bound_port: number;
  bytes_in: number;
  bytes_out: number;
  error: string | null;
}
