import pkg from "../../package.json";
import { useState, type ReactNode } from "react";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { useThemeStore } from "../stores/themeStore";
import { useSettingsStore } from "../stores/settingsStore";
import { dialogConfirm } from "../lib/dialog";
import { getTools } from "../features/dock/toolRegistry";
import {
  Sun,
  Moon,
  Info,
  Palette,
  TerminalSquare,
  Code2,
  Plug,
  Link,
  ExternalLink,
  LayoutGrid,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Check,
  AlertTriangle,
} from "lucide-react";

const APP_VERSION = pkg.version;
const REPO_URL = "https://github.com/weimosheng/QookiT";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type Category = "appearance" | "terminal" | "editor" | "connection" | "layout" | "about";

export function SettingsModal({ isOpen, onOpenChange }: SettingsModalProps) {
  const { dark, toggle } = useThemeStore();
  const settings = useSettingsStore();
  const [category, setCategory] = useState<Category>("appearance");
  const [updateState, setUpdateState] = useState<
    "idle" | "checking" | "upToDate" | "downloading" | "error"
  >("idle");
  const [updateMsg, setUpdateMsg] = useState("");
  const state = useOverlayState({ isOpen, onOpenChange });

  const handleCheckUpdate = async () => {
    setUpdateState("checking");
    setUpdateMsg("");
    try {
      const update = await check();
      if (!update) {
        setUpdateState("upToDate");
        setUpdateMsg("已是最新版本");
        return;
      }
      const ok = await dialogConfirm(
        "发现新版本",
        `新版本 v${update.version} 可用，是否下载并安装？`,
        true,
      );
      if (!ok) {
        setUpdateState("idle");
        return;
      }
      setUpdateState("downloading");
      setUpdateMsg("下载安装中...");
      let contentLength = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") contentLength = event.data.contentLength ?? 0;
        else if (event.event === "Progress")
          downloaded += event.data.chunkLength;
        else if (event.event === "Finished")
          setUpdateMsg("安装完成，请重启应用");
        if (contentLength > 0) {
          setUpdateMsg(
            `下载中 ${Math.round((downloaded / contentLength) * 100)}%`,
          );
        }
      });
      setUpdateState("upToDate");
      setUpdateMsg("更新已安装，请重启应用");
    } catch (e) {
      setUpdateState("error");
      setUpdateMsg(String(e));
    }
  };

  const categories: { id: Category; label: string; icon: ReactNode }[] = [
    { id: "appearance", label: "外观", icon: <Palette size={15} /> },
    { id: "terminal", label: "终端", icon: <TerminalSquare size={15} /> },
    { id: "editor", label: "编辑器", icon: <Code2 size={15} /> },
    { id: "connection", label: "连接", icon: <Plug size={15} /> },
    { id: "layout", label: "布局", icon: <LayoutGrid size={15} /> },
    { id: "about", label: "关于", icon: <Info size={15} /> },
  ];

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>设置</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex min-h-[360px] gap-4">
                <div className="flex w-36 flex-shrink-0 flex-col gap-1">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        category === c.id
                          ? "bg-accent-soft text-accent"
                          : "text-foreground hover:bg-default-soft"
                      }`}
                      onClick={() => setCategory(c.id)}
                    >
                      {c.icon}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>

                <div className="min-w-0 flex-1">
                  {category === "appearance" && (
                    <Section title="外观">
                      <Row label="主题模式">
                        <div className="flex gap-2">
                          <ThemeButton
                            active={!dark}
                            icon={<Sun size={15} />}
                            label="亮色"
                            onClick={() => {
                              if (dark) toggle();
                            }}
                          />
                          <ThemeButton
                            active={dark}
                            icon={<Moon size={15} />}
                            label="暗色"
                            onClick={() => {
                              if (!dark) toggle();
                            }}
                          />
                        </div>
                      </Row>
                    </Section>
                  )}

                  {category === "terminal" && (
                    <Section title="终端">
                      <Row label="字体族" hint="等宽字体优先">
                        <TextInput
                          value={settings.terminalFontFamily}
                          onChange={(v) =>
                            settings.update({ terminalFontFamily: v })
                          }
                        />
                      </Row>
                      <Row label="字号">
                        <NumberInput
                          value={settings.terminalFontSize}
                          min={8}
                          max={36}
                          onChange={(v) =>
                            settings.update({ terminalFontSize: v })
                          }
                        />
                      </Row>
                      <Row label="滚动行数" hint="保留的历史行数">
                        <NumberInput
                          value={settings.terminalScrollback}
                          min={100}
                          max={100000}
                          step={100}
                          onChange={(v) =>
                            settings.update({ terminalScrollback: v })
                          }
                        />
                      </Row>
                      <Row label="初始列数">
                        <NumberInput
                          value={settings.terminalCols}
                          min={20}
                          max={300}
                          onChange={(v) =>
                            settings.update({ terminalCols: v })
                          }
                        />
                      </Row>
                      <Row label="初始行数">
                        <NumberInput
                          value={settings.terminalRows}
                          min={5}
                          max={120}
                          onChange={(v) =>
                            settings.update({ terminalRows: v })
                          }
                        />
                      </Row>
                    </Section>
                  )}

                  {category === "editor" && (
                    <Section title="编辑器">
                      <Row label="字号">
                        <NumberInput
                          value={settings.editorFontSize}
                          min={8}
                          max={36}
                          onChange={(v) =>
                            settings.update({ editorFontSize: v })
                          }
                        />
                      </Row>
                      <Row label="Tab 大小">
                        <NumberInput
                          value={settings.editorTabSize}
                          min={1}
                          max={8}
                          onChange={(v) =>
                            settings.update({ editorTabSize: v })
                          }
                        />
                      </Row>
                      <Row label="默认自动换行" hint="打开文件时是否自动换行">
                        <Toggle
                          checked={settings.editorWordWrap}
                          onChange={(v) =>
                            settings.update({ editorWordWrap: v })
                          }
                        />
                      </Row>
                    </Section>
                  )}

                  {category === "connection" && (
                    <Section title="连接">
                      <Row label="默认端口">
                        <NumberInput
                          value={settings.defaultPort}
                          min={1}
                          max={65535}
                          onChange={(v) =>
                            settings.update({ defaultPort: v })
                          }
                        />
                      </Row>
                      <Row label="默认用户名">
                        <TextInput
                          value={settings.defaultUsername}
                          onChange={(v) =>
                            settings.update({ defaultUsername: v })
                          }
                        />
                      </Row>
                    </Section>
                  )}

                  {category === "layout" && (
                    <Section title="小侧边栏图标">
                      <p className="py-2 text-xs text-muted">
                        隐藏的图标不会显示在小侧边栏，但仍可通过其他方式打开。
                      </p>
                      {getTools()
                        .filter(
                          (t) =>
                            t.defaultSide !== "center" && !t.excludeFromLayout,
                        )
                        .map((tool) => {
                          const visible = !settings.hiddenTools.includes(
                            tool.id,
                          );
                          const sideLabel = {
                            left: "左侧",
                            right: "右侧",
                            bottom: "底部",
                            center: "中部",
                          }[tool.defaultSide ?? "center"];
                          return (
                            <Row key={tool.id} label={tool.name} hint={sideLabel}>
                              <div className="flex items-center gap-2">
                                {visible ? (
                                  <Eye size={14} className="text-muted" />
                                ) : (
                                  <EyeOff size={14} className="text-muted" />
                                )}
                                <Toggle
                                  checked={visible}
                                  onChange={(v) =>
                                    settings.update({
                                      hiddenTools: v
                                        ? settings.hiddenTools.filter(
                                            (id) => id !== tool.id,
                                          )
                                        : [...settings.hiddenTools, tool.id],
                                    })
                                  }
                                />
                              </div>
                            </Row>
                          );
                        })}
                    </Section>
                  )}

                  {category === "about" && (
                    <div className="flex flex-col gap-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-accent">
                          QookiT
                        </span>
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent">
                          v{APP_VERSION}
                        </span>
                      </div>
                      <p className="text-sm text-muted">
                        跨平台 SSH 客户端，集成终端、文件管理、代码编辑于一体。
                      </p>
                      <button
                        type="button"
                        onClick={() => void openUrl(REPO_URL)}
                        className="flex w-fit items-center gap-2 text-sm text-accent hover:underline"
                      >
                        <Link size={16} />
                        <span>GitHub 仓库</span>
                        <ExternalLink size={12} className="opacity-60" />
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCheckUpdate()}
                          disabled={
                            updateState === "checking" ||
                            updateState === "downloading"
                          }
                          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-default-soft disabled:opacity-50"
                        >
                          {updateState === "checking" ||
                          updateState === "downloading" ? (
                            <RefreshCw size={15} className="animate-spin" />
                          ) : updateState === "error" ? (
                            <AlertTriangle size={15} className="text-danger" />
                          ) : updateState === "upToDate" ? (
                            <Check size={15} className="text-accent" />
                          ) : (
                            <Download size={15} />
                          )}
                          <span>检查更新</span>
                        </button>
                        {updateMsg && (
                          <span
                            className={`text-xs ${
                              updateState === "error"
                                ? "text-danger"
                                : "text-muted"
                            }`}
                          >
                            {updateMsg}
                          </span>
                        )}
                      </div>
                      <div className="border-t border-border pt-3">
                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                          技术栈
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            "Tauri 2",
                            "React 19",
                            "TypeScript",
                            "russh",
                            "xterm.js",
                            "CodeMirror 6",
                            "HeroUI",
                          ].map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-default-soft px-2 py-1 text-xs text-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-border pt-3 text-xs text-muted">
                        <p>后端 Rust · russh · russh-sftp</p>
                        <p>前端 Vite · Tailwind CSS v4</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" onPress={() => onOpenChange(false)}>
                完成
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex flex-col">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function ThemeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border text-foreground hover:bg-default-soft"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-default-soft"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
    />
  );
}

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-52 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
    />
  );
}
