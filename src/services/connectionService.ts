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
  /** 该主机已记录的主机密钥（`算法 指纹`，来自 ~/.ssh/known_hosts）。 */
  knownHostFingerprints: (host: string, port: number) =>
    invoke<string[]>("known_host_fingerprints", { host, port }),
  /** 清除该主机已记录的主机密钥，返回删除的条目数。 */
  forgetHostKey: (host: string, port: number) =>
    invoke<number>("forget_host_key", { host, port }),
};
