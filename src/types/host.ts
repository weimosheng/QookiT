export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  group: string | null;
  initial_dir: string | null;
  created_at: string;
  updated_at: string;
}

export type AuthMethod =
  | { type: "password"; password: string }
  | { type: "private_key"; key_content: string; passphrase: string | null };

export function createEmptyHost(): Host {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "",
    port: 22,
    username: "root",
    auth: { type: "password", password: "" },
    group: null,
    initial_dir: null,
    created_at: now,
    updated_at: now,
  };
}
