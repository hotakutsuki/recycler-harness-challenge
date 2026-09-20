import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, LANG_COOKIE, translator, type Lang, type Translate } from "./i18n";

/**
 * The server half of i18n, kept apart from the dictionary so that a client
 * component can import the strings without dragging `next/headers` in with them.
 */

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

export async function getTranslator(): Promise<{ lang: Lang; t: Translate }> {
  const lang = await getLang();
  return { lang, t: translator(lang) };
}
