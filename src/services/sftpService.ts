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
  readFileWithProgress: (connectionId: string, path: string) =>
    invoke<string>("sftp_read_file_progress", { connectionId, path }),
  downloadFile: (
    connectionId: string,
    remotePath: string,
    localPath: string,
    transferId: string,
  ) =>
    invoke<void>("sftp_download_file", {
      connectionId,
      remotePath,
      localPath,
      transferId,
    }),
  uploadFile: (
    connectionId: string,
    localPath: string,
    remotePath: string,
    transferId: string,
  ) =>
    invoke<void>("sftp_upload_file", {
      connectionId,
      localPath,
      remotePath,
      transferId,
    }),
  uploadFromBase64: (
    connectionId: string,
    remotePath: string,
    dataBase64: string,
    transferId: string,
  ) =>
    invoke<void>("sftp_upload_from_base64", {
      connectionId,
      remotePath,
      dataBase64,
      transferId,
    }),
  writeFile: (connectionId: string, path: string, dataBase64: string) =>
    invoke<void>("sftp_write_file", { connectionId, path, dataBase64 }),
  canonicalize: (connectionId: string, path: string) =>
    invoke<string>("sftp_canonicalize", { connectionId, path }),
  exec: (connectionId: string, command: string) =>
    invoke<ExecResult>("ssh_exec", { connectionId, command }),
};
