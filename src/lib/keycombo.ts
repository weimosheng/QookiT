/** 修饰键固定顺序，保证存储与比较的一致性 */
const MOD_KEYS = ["Control", "Shift", "Alt", "Meta"];

/** 把 KeyboardEvent 转成组合键字符串，如 "Ctrl+Shift+T"。纯修饰键返回空串。 */
export function keyEventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (e.metaKey) parts.push("Meta");
  let key = e.key;
  if (MOD_KEYS.includes(key)) return "";
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

/** 美化组合键用于显示：方向键转箭头符号。 */
export function formatCombo(combo: string): string {
  if (!combo) return "未设置";
  return combo
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→");
}

/**
 * 判断事件目标是否为不应被全局快捷键拦截的编辑控件。
 * xterm / CodeMirror 有自身按键处理，contenteditable 同理；
 * 普通 input/textarea 不排除——全局快捷键均带修饰键，不会与文本输入冲突。
 */
export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.closest(".xterm") || el.closest(".cm-editor")) return true;
  return false;
}
