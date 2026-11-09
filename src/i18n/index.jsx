import { useEffect } from "react";
import { setLocale, tr } from "./runtime";
import { useLocale } from "./useLocale";

export default function LanguageSwitcher() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="language-switcher-wrapper">
      <label className="language-switcher">
        <span className="language-switcher-label">{tr("Мова")}:</span>
        <select
          className="language-select"
          aria-label={tr("Мова")}
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          <option value="uk">Українська</option>
          <option value="pl">Polski</option>
        </select>
      </label>
    </div>
  );
}
