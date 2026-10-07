import { invoke } from "@tauri-apps/api/core";
import type { CronJob, CronFile } from "../types/cron";

export const cronService = {
  listJobs: (connectionId: string) =>
    invoke<CronJob[]>("cron_list_jobs", { connectionId }),
  getCrontabRaw: (connectionId: string) =>
    invoke<string>("cron_get_crontab_raw", { connectionId }),
  setCrontabRaw: (connectionId: string, contentBase64: string) =>
    invoke<void>("cron_set_crontab_raw", { connectionId, contentBase64 }),
  getLogs: (connectionId: string, lines: number) =>
    invoke<string>("cron_get_logs", { connectionId, lines }),
  listSystemFiles: (connectionId: string) =>
    invoke<CronFile[]>("cron_list_system_files", { connectionId }),
  getSystemFile: (connectionId: string, name: string) =>
    invoke<string>("cron_get_system_file", { connectionId, name }),
  writeSystemFile: (
    connectionId: string,
    name: string,
    contentBase64: string,
  ) =>
    invoke<void>("cron_write_system_file", {
      connectionId,
      name,
      contentBase64,
    }),
  removeSystemFile: (connectionId: string, name: string) =>
    invoke<void>("cron_remove_system_file", { connectionId, name }),
  getJobLogs: (connectionId: string, command: string, lines: number) =>
    invoke<string>("cron_get_job_logs", { connectionId, command, lines }),
  runJob: (connectionId: string, command: string) =>
    invoke<{ stdout: string; stderr: string; exit_code: number }>(
      "cron_run_job",
      { connectionId, command },
    ),
};
