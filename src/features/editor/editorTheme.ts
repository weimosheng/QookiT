import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

interface Palette {
  bg: string;
  fg: string;
  caret: string;
  selection: string;
  lineHighlight: string;
  gutterBg: string;
  gutterFg: string;
  activeGutter: string;
  border: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  name: string;
  def: string;
  fn: string;
  type: string;
  operator: string;
  meta: string;
}

const LIGHT: Palette = {
  bg: "#ffffff",
  fg: "#1e1e2e",
  caret: "#e89a4b",
  selection: "rgba(232, 154, 75, 0.28)",
  lineHighlight: "rgba(232, 154, 75, 0.07)",
  gutterBg: "#fafafa",
  gutterFg: "#9ca3af",
  activeGutter: "rgba(232, 154, 75, 0.14)",
  border: "#e5e7eb",
  keyword: "#8839ef",
  string: "#40a02b",
  number: "#fe640b",
  comment: "#9ca0b0",
  name: "#4c4f69",
  def: "#1e66f5",
  fn: "#1e66f5",
  type: "#df8e1d",
  operator: "#04a5e5",
  meta: "#ea76cb",
};

const DARK: Palette = {
  bg: "#0a0a0f",
  fg: "#cdd6f4",
  caret: "#e89a4b",
  selection: "rgba(232, 154, 75, 0.32)",
  lineHighlight: "rgba(255, 255, 255, 0.04)",
  gutterBg: "#0a0a0f",
  gutterFg: "#6c7086",
  activeGutter: "rgba(232, 154, 75, 0.18)",
  border: "#27272f",
  keyword: "#cba6f7",
  string: "#a6e3a1",
  number: "#fab387",
  comment: "#6c7086",
  name: "#cdd6f4",
  def: "#89b4fa",
  fn: "#89b4fa",
  type: "#f9e2af",
  operator: "#89dceb",
  meta: "#f5c2e7",
};

function highlight(p: Palette): HighlightStyle {
  return HighlightStyle.define([
    { tag: t.keyword, color: p.keyword },
    {
      tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
      color: p.name,
    },
    { tag: [t.function(t.variableName), t.labelName], color: p.fn },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: p.number },
    { tag: [t.definition(t.name), t.separator], color: p.name },
    {
      tag: [
        t.typeName,
        t.className,
        t.number,
        t.changed,
        t.annotation,
        t.modifier,
        t.self,
        t.namespace,
      ],
      color: p.type,
    },
    {
      tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link],
      color: p.operator,
    },
    { tag: [t.meta, t.comment], color: p.comment, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: p.def, textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: p.def },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: p.number },
    {
      tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)],
      color: p.string,
    },
    { tag: t.invalid, color: "#e64553" },
    { tag: t.definition(t.variableName), color: p.def },
  ]);
}

function baseTheme(p: Palette, dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        color: p.fg,
        backgroundColor: p.bg,
        fontSize: "13px",
        height: "100%",
      },
      ".cm-content": {
        caretColor: p.caret,
        fontFamily: MONO_FONT,
        lineHeight: "1.6",
        padding: "6px 0",
      },
      ".cm-scroller": {
        fontFamily: MONO_FONT,
        overflow: "auto",
        height: "100%",
      },
      "&.cm-focused .cm-cursor, .cm-dropCursor": {
        borderLeftColor: p.caret,
        borderLeftWidth: "2px",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: p.selection,
        },
      ".cm-activeLine": { backgroundColor: p.lineHighlight },
      ".cm-gutters": {
        backgroundColor: p.gutterBg,
        color: p.gutterFg,
        border: "none",
        borderRight: `1px solid ${p.border}`,
      },
      ".cm-activeLineGutter": {
        backgroundColor: p.activeGutter,
        color: p.fg,
      },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 6px" },
      ".cm-foldGutter .cm-gutterElement": { padding: "0 4px" },
      ".cm-panels": {
        backgroundColor: p.gutterBg,
        color: p.fg,
        borderColor: p.border,
      },
      ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${p.border}` },
      ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${p.border}` },
      ".cm-searchMatch": {
        backgroundColor: "rgba(232, 154, 75, 0.25)",
        outline: `1px solid ${p.border}`,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "rgba(232, 154, 75, 0.5)",
      },
      ".cm-selectionMatch": { backgroundColor: "rgba(232, 154, 75, 0.16)" },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: "rgba(232, 154, 75, 0.24)",
        outline: `1px solid ${p.caret}`,
      },
      ".cm-tooltip": {
        backgroundColor: dark ? "#16161c" : "#ffffff",
        color: p.fg,
        border: `1px solid ${p.border}`,
        borderRadius: "6px",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "rgba(232, 154, 75, 0.22)",
        color: p.fg,
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul": {
        fontFamily: MONO_FONT,
      },
    },
    { dark },
  );
}

export function editorTheme(dark: boolean): Extension {
  const p = dark ? DARK : LIGHT;
  return [baseTheme(p, dark), syntaxHighlighting(highlight(p))];
}
