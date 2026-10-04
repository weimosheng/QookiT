import { invoke } from "@tauri-apps/api/core";
import type { SystemInfo } from "../types/host";

export const systemInfoService = {
  get: (hostId: string, connectionId: string) =>
    invoke<SystemInfo>("get_system_info", { hostId, connectionId }),
};
