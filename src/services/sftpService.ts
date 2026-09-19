import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types/sftp";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export const sftpService = {
  open: (connectionId: string) => invoke<void>("sftp_open", { connectionId }),
  listDir: (connectionId: string, path: string) =>
    invoke<FileEntry[]>("sftp_list_dir", { connectionId, path }),
  stat: (connectionId: string, path: string) =>
    invoke<FileEntry>("sftp_stat", { connectionId, path }),
  mkdir: (connectionId: string, path: string) =>
    invoke<void>("sftp_mkdir", { connectionId, path }),
  removeFile: (connectionId: string, path: string) =>
    invoke<void>("sftp_remove_file", { connectionId, path }),
  removeDir: (connectionId: string, path: string) =>
    invoke<void>("sftp_remove_dir", { connectionId, path }),
  rename: (connectionId: string, from: string, to: string) =>
    invoke<void>("sftp_rename", { connectionId, from, to }),
  readFile: (connectionId: string, path: string) =>
    invoke<string>("sftp_read_file", { connectionId, path }),
  writeFile: (connectionId: string, path: string, dataBase64: string) =>
    invoke<void>("sftp_write_file", { connectionId, path, dataBase64 }),
  canonicalize: (connectionId: string, path: string) =>
    invoke<string>("sftp_canonicalize", { connectionId, path }),
  exec: (connectionId: string, command: string) =>
    invoke<ExecResult>("ssh_exec", { connectionId, command }),
};
