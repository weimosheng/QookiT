import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { openCloseDialog } from "../lib/closeDialog";
import type { CloseAction } from "../stores/settingsStore";

export function useCloseHandler() {
  useEffect(() => {
    const unlisten = listen("close-requested", async () => {
      const { closeAction } = useSettingsStore.getState();
      let action: CloseAction | null = closeAction;
      if (action === "ask") {
        action = await openCloseDialog();
      }
      if (action === "close") {
        await invoke("force_quit");
      } else if (action === "minimizeToTray") {
        await getCurrentWindow().hide();
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
}
