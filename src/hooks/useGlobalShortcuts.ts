import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { shortcutActions } from "../lib/shortcutActions";
import { keyEventToCombo, isEditable } from "../lib/keycombo";

/** 全局快捷键引擎：在 App 顶层挂载一次，监听 keydown 并派发已绑定的动作。 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const combo = keyEventToCombo(e);
      if (!combo) return;
      const shortcuts = useSettingsStore.getState().shortcuts;
      const action = shortcutActions.find((a) => shortcuts[a.id] === combo);
      if (!action) return;
      e.preventDefault();
      void action.run();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
