import { invoke } from "@tauri-apps/api/core";

export const pingService = {
  ping: (host: string, port: number) =>
    invoke<number>("ping_host", { host, port }),
};
