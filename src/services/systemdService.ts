import { invoke } from "@tauri-apps/api/core";
import type { SystemdUnit, SystemdUnitStatus } from "../types/systemd";

export const systemdService = {
  listUnits: (connectionId: string) =>
    invoke<SystemdUnit[]>("systemd_list_units", { connectionId }),
  unitStatus: (connectionId: string, name: string) =>
    invoke<SystemdUnitStatus>("systemd_unit_status", { connectionId, name }),
  start: (connectionId: string, name: string) =>
    invoke<void>("systemd_start", { connectionId, name }),
  stop: (connectionId: string, name: string) =>
    invoke<void>("systemd_stop", { connectionId, name }),
  restart: (connectionId: string, name: string) =>
    invoke<void>("systemd_restart", { connectionId, name }),
  enable: (connectionId: string, name: string) =>
    invoke<void>("systemd_enable", { connectionId, name }),
  disable: (connectionId: string, name: string) =>
    invoke<void>("systemd_disable", { connectionId, name }),
  getLogs: (connectionId: string, name: string, lines: number) =>
    invoke<string>("systemd_get_logs", { connectionId, name, lines }),
  catUnit: (connectionId: string, name: string) =>
    invoke<string>("systemd_cat_unit", { connectionId, name }),
  createUnit: (
    connectionId: string,
    name: string,
    contentBase64: string,
    enable: boolean,
    start: boolean,
  ) =>
    invoke<void>("systemd_create_unit", {
      connectionId,
      name,
      contentBase64,
      enable,
      start,
    }),
};
