export interface Group {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function createEmptyGroup(name = ""): Group {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name, created_at: now, updated_at: now };
}
