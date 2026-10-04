import { useCloseDialogStore } from "../stores/closeDialogStore";
import type { CloseAction } from "../stores/settingsStore";

export function openCloseDialog(): Promise<CloseAction | null> {
  return new Promise((resolve) => {
    useCloseDialogStore.getState().open(resolve);
  });
}
