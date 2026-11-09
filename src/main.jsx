import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import LanguageSwitcher from "./i18n";
import AuthGate from "./auth/AuthGate.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <div className="app-root-container">
      <div className="global-top-bar">
        <LanguageSwitcher />
      </div>
      <AuthGate />
    </div>
  </StrictMode>,
);
