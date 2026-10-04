import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 判定命令是否可能内嵌明文凭据。
 *
 * 终端历史会持久化到 localStorage（明文），因此对明显携带密码/令牌的命令
 * 不入库，避免敏感信息长期落盘。规则保守，宁可漏过也不误伤普通命令。
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /--password(\s*=\s*|\s+)\S+/i,
  /--pass(word)?[=\s]\S+/i,
  /\b(password|passwd|token|secret|api[_-]?key|private[_-]?key|access[_-]?key)\s*[:=]\s*\S+/i,
  /authorization\s*:\s*\S+/i,
  /\bbearer\s+\S+/i,
  /\bAKIA[0-9A-Z]{16}\b/,
];

function looksSensitive(cmd: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(cmd));
}

interface CommandState {
  history: string[];
  favorites: string[];
  addHistory: (cmd: string) => void;
  addFavorite: (cmd: string) => void;
  removeFavorite: (cmd: string) => void;
  clearHistory: () => void;
}

export const useCommandStore = create<CommandState>()(
  persist(
    (set) => ({
      history: [],
      favorites: [],
      addHistory: (cmd) => {
        const c = cmd.trim();
        if (!c) return;
        // 疑似包含明文凭据的命令不入历史，避免持久化泄露。
        if (looksSensitive(c)) return;
        set((s) => ({
          history: [c, ...s.history.filter((h) => h !== c)].slice(0, 100),
        }));
      },
      addFavorite: (cmd) => {
        const c = cmd.trim();
        if (!c) return;
        set((s) => ({
          favorites: s.favorites.includes(c)
            ? s.favorites
            : [...s.favorites, c],
        }));
      },
      removeFavorite: (cmd) => {
        set((s) => ({ favorites: s.favorites.filter((f) => f !== cmd) }));
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "qookit-commands",
    },
  ),
);
