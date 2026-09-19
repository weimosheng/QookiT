export interface PaneNode {
  id: string;
  type: "pane";
  terminalIds: string[];
  activeTerminalId: string | null;
}

export interface SplitNode {
  id: string;
  type: "split";
  direction: "horizontal" | "vertical";
  children: LayoutNode[];
  sizes: number[];
}

export type LayoutNode = PaneNode | SplitNode;

export type DropZone = "top" | "bottom" | "left" | "right" | "center";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TAB_BAR_HEIGHT = 30;
export const SEPARATOR_SIZE = 4;
const MIN_PANE_PERCENT = 10;

let counter = 0;
export function genId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPane(terminalId?: string): PaneNode {
  return {
    id: genId("pane"),
    type: "pane",
    terminalIds: terminalId ? [terminalId] : [],
    activeTerminalId: terminalId ?? null,
  };
}

export function createInitialLayout(terminalId: string): LayoutNode {
  return createPane(terminalId);
}

export function findPane(node: LayoutNode, paneId: string): PaneNode | null {
  if (node.type === "pane") return node.id === paneId ? node : null;
  for (const c of node.children) {
    const r = findPane(c, paneId);
    if (r) return r;
  }
  return null;
}

export function findSplit(node: LayoutNode, splitId: string): SplitNode | null {
  if (node.type === "pane") return null;
  if (node.id === splitId) return node;
  for (const c of node.children) {
    const r = findSplit(c, splitId);
    if (r) return r;
  }
  return null;
}

export function findParent(node: LayoutNode, childId: string): SplitNode | null {
  if (node.type === "pane") return null;
  for (const c of node.children) {
    if (c.id === childId) return node;
    const r = findParent(c, childId);
    if (r) return r;
  }
  return null;
}

export function findFirstPaneId(node: LayoutNode): string {
  if (node.type === "pane") return node.id;
  return findFirstPaneId(node.children[0]);
}

export function findPaneWithTerminal(node: LayoutNode, terminalId: string): string | null {
  if (node.type === "pane") {
    return node.terminalIds.includes(terminalId) ? node.id : null;
  }
  for (const c of node.children) {
    const r = findPaneWithTerminal(c, terminalId);
    if (r) return r;
  }
  return null;
}

export function collectActiveTerminals(node: LayoutNode, out: Set<string>): void {
  if (node.type === "pane") {
    if (node.activeTerminalId) out.add(node.activeTerminalId);
    return;
  }
  for (const c of node.children) collectActiveTerminals(c, out);
}

function replaceNode(node: LayoutNode, targetId: string, newNode: LayoutNode): LayoutNode {
  if (node.id === targetId) return newNode;
  if (node.type === "split") {
    return { ...node, children: node.children.map((c) => replaceNode(c, targetId, newNode)) };
  }
  return node;
}

export function removeTerminalFromPane(
  node: LayoutNode,
  terminalId: string,
  paneId: string,
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    const terminalIds = node.terminalIds.filter((t) => t !== terminalId);
    const activeTerminalId =
      node.activeTerminalId === terminalId
        ? (terminalIds[terminalIds.length - 1] ?? null)
        : node.activeTerminalId;
    return { ...node, terminalIds, activeTerminalId };
  }
  return {
    ...node,
    children: node.children.map((c) => removeTerminalFromPane(c, terminalId, paneId)),
  };
}

export function addTerminalToPane(
  node: LayoutNode,
  terminalId: string,
  paneId: string,
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return {
      ...node,
      terminalIds: [...node.terminalIds, terminalId],
      activeTerminalId: terminalId,
    };
  }
  return {
    ...node,
    children: node.children.map((c) => addTerminalToPane(c, terminalId, paneId)),
  };
}

export function setActiveInPane(
  node: LayoutNode,
  paneId: string,
  terminalId: string,
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return { ...node, activeTerminalId: terminalId };
  }
  return {
    ...node,
    children: node.children.map((c) => setActiveInPane(c, paneId, terminalId)),
  };
}

export function cleanupLayout(node: LayoutNode): LayoutNode | null {
  if (node.type === "pane") {
    return node.terminalIds.length === 0 ? null : node;
  }
  const children = node.children
    .map((c) => cleanupLayout(c))
    .filter((c): c is LayoutNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const sizes = children.map(() => 100 / children.length);
  return { ...node, children, sizes };
}

export function splitPane(
  root: LayoutNode,
  targetPaneId: string,
  terminalId: string,
  direction: "horizontal" | "vertical",
  newPaneFirst: boolean,
): LayoutNode {
  const parent = findParent(root, targetPaneId);
  const newPane = createPane(terminalId);

  if (parent && parent.direction === direction) {
    const idx = parent.children.findIndex((c) => c.id === targetPaneId);
    const children = [...parent.children];
    children.splice(newPaneFirst ? idx : idx + 1, 0, newPane);
    const sizes = children.map(() => 100 / children.length);
    return replaceNode(root, parent.id, { ...parent, children, sizes });
  }

  const targetPane = findPane(root, targetPaneId);
  if (!targetPane) return root;
  const newSplit: SplitNode = {
    id: genId("split"),
    type: "split",
    direction,
    children: newPaneFirst ? [newPane, targetPane] : [targetPane, newPane],
    sizes: [50, 50],
  };
  return replaceNode(root, targetPaneId, newSplit);
}

export function moveTerminalToPane(
  root: LayoutNode,
  terminalId: string,
  sourcePaneId: string,
  targetPaneId: string,
): LayoutNode {
  if (sourcePaneId === targetPaneId) return root;
  let next = removeTerminalFromPane(root, terminalId, sourcePaneId);
  next = addTerminalToPane(next, terminalId, targetPaneId);
  const cleaned = cleanupLayout(next);
  return cleaned ?? next;
}

export function dropOnEdge(
  root: LayoutNode,
  terminalId: string,
  sourcePaneId: string,
  targetPaneId: string,
  zone: DropZone,
): LayoutNode {
  const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const newPaneFirst = zone === "left" || zone === "top";
  let next = removeTerminalFromPane(root, terminalId, sourcePaneId);
  next = splitPane(next, targetPaneId, terminalId, direction, newPaneFirst);
  const cleaned = cleanupLayout(next);
  return cleaned ?? next;
}

export function updateSplitSizes(
  root: LayoutNode,
  splitId: string,
  index: number,
  deltaPercent: number,
): LayoutNode {
  if (root.type === "pane") return root;
  if (root.id === splitId) {
    const sizes = [...root.sizes];
    const a = sizes[index] + deltaPercent;
    const b = sizes[index + 1] - deltaPercent;
    if (a < MIN_PANE_PERCENT || b < MIN_PANE_PERCENT) return root;
    sizes[index] = a;
    sizes[index + 1] = b;
    return { ...root, sizes };
  }
  return {
    ...root,
    children: root.children.map((c) => updateSplitSizes(c, splitId, index, deltaPercent)),
  };
}

export function computePaneRects(
  node: LayoutNode,
  rect: Rect,
  out: Record<string, Rect> = {},
): Record<string, Rect> {
  if (node.type === "pane") {
    out[node.id] = {
      x: rect.x,
      y: rect.y + TAB_BAR_HEIGHT,
      w: rect.w,
      h: Math.max(0, rect.h - TAB_BAR_HEIGHT),
    };
    return out;
  }
  const isH = node.direction === "horizontal";
  const total = isH ? rect.w : rect.h;
  const n = node.children.length;
  const sepTotal = (n - 1) * SEPARATOR_SIZE;
  const usable = Math.max(0, total - sepTotal);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    const size = node.sizes[i] / 100;
    const childLen = usable * size;
    let childRect: Rect;
    if (isH) {
      childRect = { x: rect.x + offset, y: rect.y, w: childLen, h: rect.h };
    } else {
      childRect = { x: rect.x, y: rect.y + offset, w: rect.w, h: childLen };
    }
    computePaneRects(node.children[i], childRect, out);
    offset += childLen + SEPARATOR_SIZE;
  }
  return out;
}

export function getDropZone(
  clientX: number,
  clientY: number,
  rect: Rect,
): DropZone {
  const x = (clientX - rect.x) / rect.w;
  const y = (clientY - rect.y) / rect.h;
  const threshold = 0.3;
  const distLeft = x;
  const distRight = 1 - x;
  const distTop = y;
  const distBottom = 1 - y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min > threshold) return "center";
  if (min === distTop) return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft) return "left";
  return "right";
}

export function findDropTarget(
  paneRects: Record<string, Rect>,
  x: number,
  y: number,
): { paneId: string; zone: DropZone } | null {
  for (const paneId of Object.keys(paneRects)) {
    const c = paneRects[paneId];
    if (c.w <= 0 || c.h <= 0) continue;
    const tabTop = c.y - TAB_BAR_HEIGHT;
    if (x >= c.x && x <= c.x + c.w && y >= tabTop && y < c.y) {
      return { paneId, zone: "center" };
    }
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
      return { paneId, zone: getDropZone(x, y, c) };
    }
  }
  return null;
}
