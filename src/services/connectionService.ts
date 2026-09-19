import { invoke } from "@tauri-apps/api/core";

export interface ConnectionInfo {
  connection_id: string;
  host_id: string;
  host_name: string;
}

export const connectionService = {
  connect: (hostId: string) => invoke<ConnectionInfo>("connect_host", { hostId }),
  disconnect: (connectionId: string) =>
    invoke<void>("disconnect_host", { connectionId }),
};
