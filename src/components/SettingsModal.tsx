import pkg from "../../package.json";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { useThemeStore } from "../stores/themeStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePackagingStore } from "../stores/packagingStore";
import { useLocaleStore } from "../stores/localeStore";
import { appService } from "../services/appService";
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
  Keyboard,
  Languages,
} from "lucide-react";
import { shortcutActions, type ShortcutGroup } from "../lib/shortcutActions";
import { DEFAULT_SHORTCUTS } from "../lib/shortcutDefaults";
import { formatCombo } from "../lib/keycombo";
import { ShortcutRecorder } from "./ShortcutRecorder";

const APP_VERSION = pkg.version;
const REPO_URL = "https://github.com/weimosheng/QookiT";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type Category = "appearance" | "terminal" | "editor" | "connection" | "layout" | "shortcuts" | "language" | "about";

export function SettingsModal({ isOpen, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation("settings");
  const { dark, toggle } = useThemeStore();
  const settings = useSettingsStore();
  const storeManaged = usePackagingStore((s) => s.storeManaged);
  const { locale, mode, setLocale, setAuto } = useLocaleStore();
  const [category, setCategory] = useState<Category>("appearance");
  const [updateState, setUpdateState] = useState<
    "idle" | "checking" | "upToDate" | "downloading" | "error"
  >("idle");
  const [updateMsg, setUpdateMsg] = useState("");
  // 商店版本：走 Microsoft Store 官方更新通道（StoreContext）
  const [storeState, setStoreState] = useState<
    "idle" | "checking" | "installing" | "upToDate" | "error"
  >("idle");
  const [storeMsg, setStoreMsg] = useState("");
  const state = useOverlayState({ isOpen, onOpenChange });

  const handleStoreUpdate = async () => {
    setStoreState("checking");
    setStoreMsg("");
    try {
      const info = await appService.checkStoreUpdates();
      if (!info.available) {
        setStoreState("upToDate");
        setStoreMsg(t("up_to_date"));
        return;
      }
      const ok = await dialogConfirm(
        t("new_version_found"),
        t("store_new_version_msg"),
        true,
      );
      if (!ok) {
        setStoreState("idle");
        return;
      }
      setStoreState("installing");
      setStoreMsg(t("installing_via_store"));
      const result = await appService.installStoreUpdates();
      if (result.state === "installed" || result.state === "upToDate") {
        setStoreState("upToDate");
      } else if (result.state === "canceled") {
        setStoreState("idle");
      } else {
        setStoreState("error");
      }
      setStoreMsg(result.message);
    } catch (e) {
      setStoreState("error");
      setStoreMsg(`${e}${t("store_update_error_suffix")}`);
    }
  };

  const handleCheckUpdate = async () => {
    // 商店版本不提供自更新（MSIX 安装目录只读），双保险避免误调用。
    if (storeManaged) return;
    setUpdateState("checking");
    setUpdateMsg("");
    try {
      const update = await check();
      if (!update) {
        setUpdateState("upToDate");
        setUpdateMsg(t("up_to_date"));
        return;
      }
      const ok = await dialogConfirm(
        t("new_version_found"),
        t("new_version_msg", { version: update.version }),
        true,
      );
      if (!ok) {
        setUpdateState("idle");
        return;
      }
      setUpdateState("downloading");
      setUpdateMsg(t("downloading_installing"));
      let contentLength = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") contentLength = event.data.contentLength ?? 0;
        else if (event.event === "Progress")
          downloaded += event.data.chunkLength;
        else if (event.event === "Finished")
          setUpdateMsg(t("install_finished"));
        if (contentLength > 0) {
          setUpdateMsg(
            t("downloading_percent", { percent: Math.round((downloaded / contentLength) * 100) }),
          );
        }
      });
      setUpdateState("upToDate");
      setUpdateMsg(t("update_installed"));
    } catch (e) {
      setUpdateState("error");
      setUpdateMsg(String(e));
    }
  };

  const categories: { id: Category; label: string; icon: ReactNode }[] = [
    { id: "appearance", label: t("cat_appearance"), icon: <Palette size={15} /> },
    { id: "terminal", label: t("cat_terminal"), icon: <TerminalSquare size={15} /> },
    { id: "editor", label: t("cat_editor"), icon: <Code2 size={15} /> },
    { id: "connection", label: t("cat_connection"), icon: <Plug size={15} /> },
    { id: "layout", label: t("cat_layout"), icon: <LayoutGrid size={15} /> },
    { id: "shortcuts", label: t("cat_shortcuts"), icon: <Keyboard size={15} /> },
    { id: "language", label: t("cat_language"), icon: <Languages size={15} /> },
    { id: "about", label: t("cat_about"), icon: <Info size={15} /> },
  ];

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
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
                    <Section title={t("cat_appearance")}>
                      <Row label={t("theme_mode")}>
                        <div className="flex gap-2">
                          <ThemeButton
                            active={!dark}
                            icon={<Sun size={15} />}
                            label={t("light")}
                            onClick={() => {
                              if (dark) toggle();
                            }}
                          />
                          <ThemeButton
                            active={dark}
                            icon={<Moon size={15} />}
                            label={t("dark")}
                            onClick={() => {
                              if (!dark) toggle();
                            }}
                          />
                        </div>
                      </Row>
                    </Section>
                  )}

                  {category === "terminal" && (
                    <Section title={t("cat_terminal")}>
                      <Row label={t("terminal_font")} hint={t("terminal_font_hint")}>
                        <TextInput
                          value={settings.terminalFontFamily}
                          onChange={(v) =>
                            settings.update({ terminalFontFamily: v })
                          }
                        />
                      </Row>
                      <Row label={t("terminal_size")}>
                        <NumberInput
                          value={settings.terminalFontSize}
                          min={8}
                          max={36}
                          onChange={(v) =>
                            settings.update({ terminalFontSize: v })
                          }
                        />
                      </Row>
                      <Row label={t("terminal_scrollback")} hint={t("terminal_scrollback_hint")}>
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
                      <Row label={t("terminal_cols")}>
                        <NumberInput
                          value={settings.terminalCols}
                          min={20}
                          max={300}
                          onChange={(v) =>
                            settings.update({ terminalCols: v })
                          }
                        />
                      </Row>
                      <Row label={t("terminal_rows")}>
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
                    <Section title={t("cat_editor")}>
                      <Row label={t("editor_size")}>
                        <NumberInput
                          value={settings.editorFontSize}
                          min={8}
                          max={36}
                          onChange={(v) =>
                            settings.update({ editorFontSize: v })
                          }
                        />
                      </Row>
                      <Row label={t("editor_tab_size")}>
                        <NumberInput
                          value={settings.editorTabSize}
                          min={1}
                          max={8}
                          onChange={(v) =>
                            settings.update({ editorTabSize: v })
                          }
                        />
                      </Row>
                      <Row label={t("editor_wrap")} hint={t("editor_wrap_hint")}>
                        <Toggle
                          checked={settings.editorWordWrap}
                          onChange={(v) =>
                            settings.update({ editorWordWrap: v })
                          }
                        />
                      </Row>
                      <Row
                        label={t("editor_max_size")}
                        hint={t("editor_max_size_hint")}
                      >
                        <NumberInput
                          value={settings.editorMaxFileSizeMb}
                          min={1}
                          max={256}
                          onChange={(v) =>
                            settings.update({ editorMaxFileSizeMb: v })
                          }
                        />
                      </Row>
                    </Section>
                  )}

                  {category === "connection" && (
                    <Section title={t("cat_connection")}>
                      <Row label={t("default_port")}>
                        <NumberInput
                          value={settings.defaultPort}
                          min={1}
                          max={65535}
                          onChange={(v) =>
                            settings.update({ defaultPort: v })
                          }
                        />
                      </Row>
                      <Row label={t("default_username")}>
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
                    <Section title={t("layout_title")}>
                      <p className="py-2 text-xs text-muted">
                        {t("layout_hint")}
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
                            left: t("side_left"),
                            right: t("side_right"),
                            bottom: t("side_bottom"),
                            center: t("side_center"),
                          }[tool.defaultSide ?? "center"];
                          return (
                            <Row key={tool.id} label={tool.nameKey ? t(tool.nameKey) : (tool.name ?? tool.id)} hint={sideLabel}>
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

                  {category === "shortcuts" && <ShortcutSection />}

                  {category === "language" && (
                    <Section title={t("cat_language")}>
                      <div className="flex flex-col gap-2">
                        <LanguageOption
                          active={mode === "auto"}
                          icon={<Languages size={15} />}
                          label={t("language_auto")}
                          onClick={() => setAuto()}
                        />
                        <LanguageOption
                          active={mode === "manual" && locale === "zh"}
                          icon={<span className="text-sm font-medium">中</span>}
                          label={t("language_zh")}
                          onClick={() => setLocale("zh")}
                        />
                        <LanguageOption
                          active={mode === "manual" && locale === "en"}
                          icon={<span className="text-sm font-medium">En</span>}
                          label={t("language_en")}
                          onClick={() => setLocale("en")}
                        />
                      </div>
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
                        {t("about_desc")}
                      </p>
                      <button
                        type="button"
                        onClick={() => void openUrl(REPO_URL)}
                        className="flex w-fit items-center gap-2 text-sm text-accent hover:underline"
                      >
                        <Link size={16} />
                        <span>{t("github_repo")}</span>
                        <ExternalLink size={12} className="opacity-60" />
                      </button>
                      {storeManaged ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleStoreUpdate()}
                              disabled={
                                storeState === "checking" ||
                                storeState === "installing"
                              }
                              className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-default-soft disabled:opacity-50"
                            >
                              {storeState === "checking" ||
                              storeState === "installing" ? (
                                <RefreshCw size={15} className="animate-spin" />
                              ) : storeState === "error" ? (
                                <AlertTriangle
                                  size={15}
                                  className="text-danger"
                                />
                              ) : storeState === "upToDate" ? (
                                <Check size={15} className="text-accent" />
                              ) : (
                                <Download size={15} />
                              )}
                              <span>{t("check_update")}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void openUrl(
                                  "ms-windows-store://downloadsandupdates",
                                ).catch(() => {});
                              }}
                              className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-accent"
                            >
                              <ExternalLink size={12} />
                              <span>{t("store_update_page")}</span>
                            </button>
                            {storeMsg && (
                              <span
                                className={`text-xs ${
                                  storeState === "error"
                                    ? "text-danger"
                                    : "text-muted"
                                }`}
                              >
                                {storeMsg}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted">
                            {t("store_update_hint")}
                          </span>
                        </div>
                      ) : (
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
                            <span>{t("check_update")}</span>
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
                      )}
                      <div className="border-t border-border pt-3">
                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                          {t("tech_stack")}
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
                        <p>{t("backend_stack")}</p>
                        <p>{t("frontend_stack")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" onPress={() => onOpenChange(false)}>
                {t("done")}
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

function LanguageOption({
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
      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border text-foreground hover:bg-default-soft"
      }`}
    >
      <span className="flex items-center gap-2 whitespace-nowrap">
        {icon}
        <span>{label}</span>
      </span>
      {active && <Check size={15} className="text-accent" />}
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

function ShortcutSection() {
  const { t } = useTranslation("settings");
  const settings = useSettingsStore();
  const [conflict, setConflict] = useState<string | null>(null);

  const handleChange = (actionId: string, combo: string) => {
    const owner = Object.entries(settings.shortcuts).find(
      ([id, key]) => id !== actionId && key === combo && key !== "",
    );
    if (owner) {
      const ownerKey = shortcutActions.find((a) => a.id === owner[0])?.labelKey;
      const ownerLabel = ownerKey ? t(ownerKey) : owner[0];
      setConflict(t("shortcut_conflict", { combo: formatCombo(combo), owner: ownerLabel }));
      return;
    }
    setConflict(null);
    settings.update({
      shortcuts: { ...settings.shortcuts, [actionId]: combo },
    });
  };

  const handleClear = (actionId: string) => {
    setConflict(null);
    settings.update({
      shortcuts: { ...settings.shortcuts, [actionId]: "" },
    });
  };

  const handleResetAll = () => {
    setConflict(null);
    settings.update({ shortcuts: { ...DEFAULT_SHORTCUTS } });
  };

  const groups: { id: ShortcutGroup; label: string }[] = [
    { id: "general", label: t("shortcuts_group_general") },
    { id: "tools", label: t("shortcuts_group_tools") },
    { id: "connection", label: t("shortcuts_group_connection") },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-2">
        <h3 className="text-sm font-medium text-foreground">{t("shortcuts_title")}</h3>
        <button
          type="button"
          onClick={handleResetAll}
          className="text-xs text-accent hover:underline"
        >
          {t("shortcuts_reset")}
        </button>
      </div>
      {conflict && <p className="pb-2 text-xs text-danger">{conflict}</p>}
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col">
          <p className="py-1.5 text-xs text-muted">{g.label}</p>
          <div className="divide-y divide-border">
            {shortcutActions
              .filter((a) => a.group === g.id)
              .map((a) => (
                <Row key={a.id} label={t(a.labelKey)}>
                  <ShortcutRecorder
                    value={settings.shortcuts[a.id] ?? ""}
                    onChange={(combo) => handleChange(a.id, combo)}
                    onClear={() => handleClear(a.id)}
                  />
                </Row>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
