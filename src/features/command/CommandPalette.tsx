import { useTranslation } from "react-i18next";
import { useCommandStore } from "../../stores/commandStore";
import { useTerminalActiveStore } from "../../stores/terminalActiveStore";
import { terminalService } from "../../services/terminalService";
import { dialogPrompt, dialogAlert, dialogConfirm } from "../../lib/dialog";
import {
  Plus,
  Star,
  Trash2,
  CornerDownLeft,
  Command as CommandIcon,
  History,
} from "lucide-react";

interface CommandPaletteProps {
  connectionId: string;
}

export function CommandPalette({ connectionId }: CommandPaletteProps) {
  const { t } = useTranslation("command");
  const history = useCommandStore((s) => s.history);
  const favorites = useCommandStore((s) => s.favorites);
  const addFavorite = useCommandStore((s) => s.addFavorite);
  const removeFavorite = useCommandStore((s) => s.removeFavorite);
  const clearHistory = useCommandStore((s) => s.clearHistory);
  const activeTerminalId = useTerminalActiveStore(
    (s) => s.activeByConnection[connectionId] ?? null,
  );

  const run = async (cmd: string) => {
    const ok = await dialogConfirm(t("run_confirm"), t("run_confirm_msg", { cmd }));
    if (!ok) return;
    if (!activeTerminalId) {
      await dialogAlert(t("no_terminal_title"), t("no_terminal_msg"));
      return;
    }
    await terminalService.write(connectionId, activeTerminalId, cmd + "\n");
  };

  const handleAdd = async () => {
    const cmd = await dialogPrompt(t("add_favorite"), "", t("add_favorite_prompt"));
    if (cmd) addFavorite(cmd);
  };

  return (
    <div className="flex h-full flex-col select-none">
      <div className="flex flex-1 flex-col overflow-hidden border-b border-border">
        <div className="flex items-center gap-2 border-b border-border bg-background px-2 py-1">
          <span className="text-sm font-medium">{t("favorites")}</span>
          <span className="text-xs text-muted">({favorites.length})</span>
          <div className="flex-1" />
          <button
            className="rounded p-1 hover:bg-default-soft"
            onClick={handleAdd}
            title={t("add_favorite")}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {favorites.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted">{t("no_favorites")}</div>
          ) : (
            favorites.map((cmd) => (
              <CommandRow
                key={cmd}
                cmd={cmd}
                icon={<CommandIcon size={13} className="flex-shrink-0 text-accent" />}
                onRun={() => run(cmd)}
                trailing={
                  <button
                    className="rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFavorite(cmd);
                    }}
                    title={t("remove_favorite")}
                  >
                    <Trash2 size={13} />
                  </button>
                }
              />
            ))
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-background px-2 py-1">
          <span className="text-sm font-medium">{t("history")}</span>
          <span className="text-xs text-muted">({history.length})</span>
          <div className="flex-1" />
          <button
            className="rounded p-1 hover:bg-default-soft"
            onClick={clearHistory}
            title={t("clear_history")}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted">{t("no_history")}</div>
          ) : (
            history.map((cmd) => {
              const isFav = favorites.includes(cmd);
              return (
                <CommandRow
                  key={cmd}
                  cmd={cmd}
                  icon={<History size={13} className="flex-shrink-0 text-muted" />}
                  onRun={() => run(cmd)}
                  trailing={
                    <button
                      className={`rounded p-0.5 opacity-0 group-hover:opacity-100 ${
                        isFav ? "text-accent" : "text-muted hover:text-accent"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        isFav ? removeFavorite(cmd) : addFavorite(cmd);
                      }}
                      title={isFav ? t("unfavorite") : t("favorite")}
                    >
                      <Star
                        size={13}
                        fill={isFav ? "currentColor" : "none"}
                      />
                    </button>
                  }
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

interface CommandRowProps {
  cmd: string;
  icon: React.ReactNode;
  onRun: () => void;
  trailing: React.ReactNode;
}

function CommandRow({ cmd, icon, onRun, trailing }: CommandRowProps) {
  return (
    <div
      className="group flex cursor-pointer items-center gap-1 px-2 py-1.5 text-sm hover:bg-accent-soft"
      onClick={onRun}
    >
      {icon}
      <span className="flex-1 truncate font-mono text-xs">{cmd}</span>
      {trailing}
      <CornerDownLeft
        size={13}
        className="flex-shrink-0 text-muted opacity-0 group-hover:opacity-100"
      />
    </div>
  );
}
