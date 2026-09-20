"use client";

import { usePathname } from "next/navigation";
import { setLanguage } from "@/app/actions/language";
import { LANGUAGES, type Lang } from "@/lib/i18n";

/**
 * Two buttons, not a dropdown. There are exactly two languages, and the switch has
 * to be obvious to someone who cannot read the language currently on screen —
 * which is the entire situation it exists for.
 */
export function LanguageSwitch({ lang, label }: { lang: Lang; label: string }) {
  const path = usePathname();

  return (
    <div className="langswitch" role="group" aria-label={label}>
      {LANGUAGES.map((option) => (
        <form action={setLanguage} key={option}>
          <input type="hidden" name="lang" value={option} />
          <input type="hidden" name="path" value={path} />
          <button type="submit" aria-current={option === lang} disabled={option === lang}>
            {option.toUpperCase()}
          </button>
        </form>
      ))}
    </div>
  );
}
