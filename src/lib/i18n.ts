import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCommon from "../locales/zh/common.json";
import zhTitlebar from "../locales/zh/titlebar.json";
import zhConnection from "../locales/zh/connection.json";
import zhSettings from "../locales/zh/settings.json";
import zhDialog from "../locales/zh/dialog.json";
import zhSftp from "../locales/zh/sftp.json";
import zhEditor from "../locales/zh/editor.json";
import zhTerminal from "../locales/zh/terminal.json";
import zhSearch from "../locales/zh/search.json";
import zhCommand from "../locales/zh/command.json";
import zhPerformance from "../locales/zh/performance.json";
import zhTransfer from "../locales/zh/transfer.json";
import zhDock from "../locales/zh/dock.json";
import zhShortcut from "../locales/zh/shortcut.json";

import enCommon from "../locales/en/common.json";
import enTitlebar from "../locales/en/titlebar.json";
import enConnection from "../locales/en/connection.json";
import enSettings from "../locales/en/settings.json";
import enDialog from "../locales/en/dialog.json";
import enSftp from "../locales/en/sftp.json";
import enEditor from "../locales/en/editor.json";
import enTerminal from "../locales/en/terminal.json";
import enSearch from "../locales/en/search.json";
import enCommand from "../locales/en/command.json";
import enPerformance from "../locales/en/performance.json";
import enTransfer from "../locales/en/transfer.json";
import enDock from "../locales/en/dock.json";
import enShortcut from "../locales/en/shortcut.json";

export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";

const resources = {
  zh: {
    common: zhCommon,
    titlebar: zhTitlebar,
    connection: zhConnection,
    settings: zhSettings,
    dialog: zhDialog,
    sftp: zhSftp,
    editor: zhEditor,
    terminal: zhTerminal,
    search: zhSearch,
    command: zhCommand,
    performance: zhPerformance,
    transfer: zhTransfer,
    dock: zhDock,
    shortcut: zhShortcut,
  },
  en: {
    common: enCommon,
    titlebar: enTitlebar,
    connection: enConnection,
    settings: enSettings,
    dialog: enDialog,
    sftp: enSftp,
    editor: enEditor,
    terminal: enTerminal,
    search: enSearch,
    command: enCommand,
    performance: enPerformance,
    transfer: enTransfer,
    dock: enDock,
    shortcut: enShortcut,
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
