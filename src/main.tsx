import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useThemeStore } from "./stores/themeStore";
import { useLocaleStore } from "./stores/localeStore";
import "./lib/i18n";
import "./index.css";

useThemeStore.getState().init();
useLocaleStore.getState().init();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
