import { useEffect } from "react";
import { setLocale, tr } from "../../../i18n/runtime";
import { useLocale } from "../../../i18n/useLocale";
// Tasks-owned language control for the Tasks header. Uses the shared locale runtime (logic),
// but its markup and styling belong to the Tasks design system.
export default function TasksLanguageSwitcher({ className = "" }) {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <label className={`tk-language ${className}`.trim()}>
      <span className="tk-language-label">{tr("Мова")}</span>
      <select aria-label={tr("Мова")} value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="uk">Українська</option>
        <option value="pl">Polski</option>
      </select>
    </label>
  );
}
