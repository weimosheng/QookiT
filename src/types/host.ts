import { useSettingsStore } from "../stores/settingsStore";

export interface SystemInfo {
  os: string | null;
  system: string | null;
  kernel: string | null;
  arch: string | null;
  cpu_cores: number | null;
  mem_total_mb: number | null;
  mem_available_mb: number | null;
}

export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  group: string | null;
  initial_dir: string | null;
  system_info: SystemInfo | null;
  created_at: string;
  updated_at: string;
}

export type AuthMethod =
  | { type: "password"; password: string }
  | { type: "private_key"; key_content: string; passphrase: string | null };

export function createEmptyHost(): Host {
  const now = new Date().toISOString();
  const s = useSettingsStore.getState();
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "",
    port: s.defaultPort,
    username: s.defaultUsername,
    auth: { type: "password", password: "" },
    group: null,
    initial_dir: null,
    system_info: null,
    created_at: now,
    updated_at: now,
  };
}
