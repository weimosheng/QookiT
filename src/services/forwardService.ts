import { invoke } from "@tauri-apps/api/core";
import type { ForwardInfo, ForwardKind } from "../types/forward";

export const forwardService = {
  add: (
    connectionId: string,
    kind: ForwardKind,
    localHost: string,
    localPort: number,
    remoteHost: string,
    remotePort: number,
  ) =>
    invoke<string>("forward_add", {
      connectionId,
      kind,
      localHost,
      localPort,
      remoteHost,
      remotePort,
    }),
  remove: (connectionId: string, forwardId: string) =>
    invoke<void>("forward_remove", { connectionId, forwardId }),
  list: (connectionId: string) =>
    invoke<ForwardInfo[]>("forward_list", { connectionId }),
};
