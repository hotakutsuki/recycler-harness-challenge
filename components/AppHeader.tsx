import Link from "next/link";
import { LanguageSwitch } from "./LanguageSwitch";
import type { Lang, Translate } from "@/lib/i18n";

const NAV = [
  { href: "/capturar", key: "nav.capture" },
  { href: "/revisar", key: "nav.review", soon: true },
  { href: "/reportes", key: "nav.reports", soon: true },
  { href: "/configuracion", key: "nav.settings" },
];

export function AppHeader({ lang, t }: { lang: Lang; t: Translate }) {
  return (
    <header className="app">
      <div className="bar">
        <div>
          <h1>{t("app.name")}</h1>
          <p>{t("app.tagline")}</p>
        </div>
        <LanguageSwitch lang={lang} label={t("lang.label")} />
      </div>
      <nav>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={item.soon ? "soon" : undefined}>
            {t(item.key)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
