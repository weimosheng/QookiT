import { useDialogStore } from "../stores/dialogStore";

let counter = 0;

export function dialogAlert(
  title: string,
  message?: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const id = `dlg-${++counter}`;
    useDialogStore.getState().open({
      id,
      type: "alert",
      title,
      message,
      resolve: () => resolve(),
    });
  });
}

export function dialogConfirm(
  title: string,
  message?: string,
  danger = false,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const id = `dlg-${++counter}`;
    useDialogStore.getState().open({
      id,
      type: "confirm",
      title,
      message,
      danger,
      resolve: (v) => resolve(!!v),
    });
  });
}

export function dialogPrompt(
  title: string,
  defaultValue?: string,
  message?: string,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const id = `dlg-${++counter}`;
    useDialogStore.getState().open({
      id,
      type: "prompt",
      title,
      message,
      defaultValue,
      resolve: (v) => resolve(typeof v === "string" ? v : null),
    });
  });
}
