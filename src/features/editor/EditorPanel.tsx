import { useCallback, useEffect, useRef, useState } from "react";
import { Compartment, EditorState, type Extension, type Text } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { sftpService } from "../../services/sftpService";
import { useDockStore } from "../dock/dockStore";
import { useThemeStore } from "../../stores/themeStore";
import { dialogAlert } from "../../lib/dialog";
import { cn } from "../../lib/cn";
import { editorTheme } from "./editorTheme";
import { detectLanguage, loadLanguage } from "./languageLoader";
import { EncodingSelect } from "./EncodingSelect";
import {
  AlertTriangle,
  Check,
  FileCode,
  FileWarning,
  Loader2,
  Redo2,
  RefreshCw,
  Save,
  Undo2,
  WrapText,
} from "lucide-react";

const ENCODINGS: { value: string; label: string }[] = [
  { value: "utf-8", label: "UTF-8" },
  { value: "gbk", label: "GBK" },
  { value: "gb18030", label: "GB18030" },
  { value: "big5", label: "Big5" },
  { value: "shift-jis", label: "Shift-JIS" },
  { value: "euc-kr", label: "EUC-KR" },
  { value: "iso-8859-1", label: "Latin-1 (ISO-8859-1)" },
  { value: "utf-16le", label: "UTF-16LE" },
];

const MAX_OPEN_BYTES = 4 * 1024 * 1024;
const LARGE_FILE_BYTES = 1024 * 1024;

type EditorStatus = "loading" | "ready" | "error" | "binary" | "too-large";

interface EditorPanelProps {
  connectionId: string;
  instanceId: string;
  path: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function EditorPanel({ connectionId, instanceId, path }: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialDocRef = useRef<Text | null>(null);
  const dirtyRef = useRef(false);
  const largeFileRef = useRef(false);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());

  const [status, setStatus] = useState<EditorStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [languageLabel, setLanguageLabel] = useState("Plain Text");
  const [largeFile, setLargeFile] = useState(false);
  const [encoding, setEncoding] = useState("utf-8");
  const [wrap, setWrap] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const dark = useThemeStore((s) => s.dark);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const encodingRef = useRef(encoding);
  encodingRef.current = encoding;
  const wrapRef = useRef(wrap);
  wrapRef.current = wrap;
  const rawBytesRef = useRef<Uint8Array | null>(null);
  const setTabDirty = useDockStore((s) => s.setTabDirty);

  const createView = useCallback(
    (text: string, big: boolean) => {
      const parent = containerRef.current;
      if (!parent) return;

      const extensions: Extension[] = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        EditorView.contentAttributes.of({
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...foldKeymap,
          indentWithTab,
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void saveRef.current?.();
              return true;
            },
          },
        ]),
        themeCompartment.current.of(editorTheme(darkRef.current)),
        langCompartment.current.of([]),
        wrapCompartment.current.of(
          wrapRef.current ? EditorView.lineWrapping : [],
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = largeFileRef.current
            ? true
            : initialDocRef.current
              ? !update.state.doc.eq(initialDocRef.current)
              : true;
          if (next === dirtyRef.current) return;
          dirtyRef.current = next;
          setDirty(next);
          setTabDirty(connectionId, instanceId, next);
        }),
      ];

      if (!big) {
        extensions.push(
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightSelectionMatches(),
          foldGutter(),
        );
      }

      const state = EditorState.create({ doc: text, extensions });
      initialDocRef.current = state.doc;
      viewRef.current = new EditorView({ state, parent });
    },
    [connectionId, instanceId, setTabDirty],
  );

  const openView = useCallback(
    (text: string, big: boolean, isCancelled: () => boolean) => {
      createView(text, big);
      setStatus("ready");
      const def = detectLanguage(path);
      setLanguageLabel(def ? def.label : "Plain Text");
      if (!def || big) return;
      void (async () => {
        const extension = await loadLanguage(def.id);
        if (isCancelled() || !extension) return;
        viewRef.current?.dispatch({
          effects: langCompartment.current.reconfigure(extension),
        });
      })();
    },
    [createView, path],
  );

  const reload = useCallback(
    async (enc: string, isCancelled: () => boolean) => {
      if (isCancelled()) return;
      viewRef.current?.destroy();
      viewRef.current = null;
      initialDocRef.current = null;
      dirtyRef.current = false;
      largeFileRef.current = false;
      setStatus("loading");
      setErrorMsg("");
      setDirty(false);
      setLanguageLabel("Plain Text");
      setLargeFile(false);
      setSaved(false);
      setTabDirty(connectionId, instanceId, false);
      try {
        try {
          const info = await sftpService.stat(connectionId, path);
          if (info.size > MAX_OPEN_BYTES) {
            setStatus("too-large");
            return;
          }
        } catch {
          // stat 失败时退化为读取后再判断
        }
        const base64 = await sftpService.readFile(connectionId, path);
        if (isCancelled() || base64.length > MAX_OPEN_BYTES * 1.4) {
          setStatus("too-large");
          return;
        }
        const bytes = base64ToBytes(base64);
        rawBytesRef.current = bytes;
        if (bytes.indexOf(0) >= 0) {
          setStatus("binary");
          return;
        }
        let text: string;
        try {
          text = new TextDecoder(enc, { fatal: true }).decode(bytes);
        } catch {
          try {
            text = new TextDecoder(enc).decode(bytes);
          } catch {
            setErrorMsg(`不支持的编码：${enc}`);
            setStatus("error");
            return;
          }
        }
        if (text.indexOf("\0") >= 0) {
          setStatus("binary");
          return;
        }
        const big = bytes.length > LARGE_FILE_BYTES;
        largeFileRef.current = big;
        setLargeFile(big);
        openView(text, big, isCancelled);
      } catch (e) {
        setErrorMsg(String(e));
        setStatus("error");
      }
    },
    [connectionId, path, instanceId, setTabDirty, openView],
  );

  useEffect(() => {
    let cancelled = false;
    void reload(encodingRef.current, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [connectionId, path, refreshKey, reload]);

  const reloadFromServer = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const changeEncoding = useCallback(
    (enc: string) => {
      setEncoding(enc);
      const bytes = rawBytesRef.current;
      if (!bytes) return;
      let text: string;
      try {
        text = new TextDecoder(enc, { fatal: true }).decode(bytes);
      } catch {
        try {
          text = new TextDecoder(enc).decode(bytes);
        } catch {
          void dialogAlert("编码错误", `无法用 ${enc} 解码该文件`);
          return;
        }
      }
      if (text.indexOf("\0") >= 0) {
        setStatus("binary");
        return;
      }
      const big = largeFileRef.current;
      openView(text, big, () => false);
    },
    [openView],
  );

  const toggleWrap = useCallback(() => {
    const next = !wrapRef.current;
    wrapRef.current = next;
    setWrap(next);
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(
        next ? EditorView.lineWrapping : [],
      ),
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (viewRef.current) undo(viewRef.current);
  }, []);

  const handleRedo = useCallback(() => {
    if (viewRef.current) redo(viewRef.current);
  }, []);

  useEffect(() => {
    darkRef.current = dark;
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(editorTheme(dark)),
    });
  }, [dark]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const ro = new ResizeObserver(() => {
      if (parent.clientWidth === 0 || parent.clientHeight === 0) return;
      viewRef.current?.requestMeasure();
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  const save = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !dirtyRef.current) return;
    setSaving(true);
    try {
      await sftpService.writeFile(
        connectionId,
        path,
        textToBase64(view.state.doc.toString()),
      );
      initialDocRef.current = view.state.doc;
      dirtyRef.current = false;
      setDirty(false);
      setTabDirty(connectionId, instanceId, false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      await dialogAlert("保存失败", String(e));
    } finally {
      setSaving(false);
    }
  }, [connectionId, path, instanceId, setTabDirty]);

  saveRef.current = save;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
        <FileCode size={13} className="flex-shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-muted" title={path}>
          {path}
        </span>
        {largeFile && (
          <span className="flex-shrink-0 rounded bg-default-soft px-1.5 py-0.5 text-[10px] text-muted">
            大文件模式
          </span>
        )}
        <span className="flex-shrink-0 rounded bg-default-soft px-1.5 py-0.5 text-[10px] text-muted">
          {languageLabel}
        </span>

        <div className="flex flex-shrink-0 items-center gap-0.5 pl-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={status !== "ready"}
            className="rounded p-1 text-muted transition-colors hover:bg-default-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={status !== "ready"}
            className="rounded p-1 text-muted transition-colors hover:bg-default-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            onClick={reloadFromServer}
            disabled={status === "loading"}
            className="rounded p-1 text-muted transition-colors hover:bg-default-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="从服务器重新加载"
          >
            <RefreshCw size={14} className={status === "loading" ? "animate-spin" : ""} />
          </button>
          <EncodingSelect
            value={encoding}
            options={ENCODINGS}
            onChange={changeEncoding}
            disabled={status === "loading"}
          />
          <button
            type="button"
            onClick={toggleWrap}
            disabled={status !== "ready"}
            className={cn(
              "rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              wrap
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-default-soft hover:text-foreground",
            )}
            title="自动换行"
          >
            <WrapText size={14} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving || status !== "ready"}
          className={cn(
            "flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
            dirty && status === "ready"
              ? "text-accent hover:bg-accent-soft"
              : "cursor-not-allowed text-muted opacity-50",
          )}
          title="保存 (Ctrl+S)"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved && !dirty ? (
            <Check size={13} />
          ) : (
            <Save size={13} />
          )}
          <span>{saving ? "保存中" : saved && !dirty ? "已保存" : "保存"}</span>
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background px-6 text-center text-sm text-muted">
            {status === "loading" && (
              <>
                <Loader2 size={22} className="animate-spin text-accent" />
                <span>正在读取文件...</span>
              </>
            )}
            {status === "error" && (
              <>
                <AlertTriangle size={22} className="text-danger" />
                <span>打开失败</span>
                <span className="max-w-full break-all text-xs text-danger">
                  {errorMsg}
                </span>
              </>
            )}
            {status === "binary" && (
              <>
                <FileWarning size={22} className="text-accent" />
                <span>二进制文件，无法以文本方式编辑</span>
              </>
            )}
            {status === "too-large" && (
              <>
                <FileWarning size={22} className="text-accent" />
                <span>
                  文件超过 4 MB，已取消打开以避免阻塞界面
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
