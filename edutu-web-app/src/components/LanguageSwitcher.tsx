import { useTranslation } from "react-i18next";
import {
  changeLanguage,
  getCurrentLanguage,
  supportedLanguages,
  type SupportedLanguage,
} from "../i18n";

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const i18nCode = i18n.language?.split("-")[0] as SupportedLanguage | undefined;
  const active = i18nCode ?? getCurrentLanguage();

  return (
    <select
      value={active}
      onChange={(event) => changeLanguage(event.target.value as SupportedLanguage)}
      aria-label={t("settings.language.title")}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
    >
      {supportedLanguages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
