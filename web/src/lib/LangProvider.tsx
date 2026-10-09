import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Ctx, type Lang, LangCtx, LOCALE, STORAGE_KEY, detectInitialLang, dicts } from "./i18n";

// In its own file: react-refresh wants a component module to export only components.
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice holds for this page only.
    }
  }, []);

  const value: Ctx = useMemo(
    () => ({ lang, setLang, t: dicts[lang], locale: LOCALE[lang] }),
    [lang, setLang],
  );

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
