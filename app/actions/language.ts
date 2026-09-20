"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE } from "@/lib/i18n";

/**
 * Sets the language cookie and reloads the page the person is on.
 *
 * The redirect is not decoration: a cookie written inside an action is not visible
 * to the re-render that the same action triggers, so revalidating alone leaves the
 * page in the old language until the next navigation — which reads as a broken
 * switch. Redirecting re-requests the page with the cookie in place.
 */
export async function setLanguage(formData: FormData) {
  const lang = formData.get("lang");
  const path = String(formData.get("path") ?? "/");

  if (isLang(lang)) {
    (await cookies()).set(LANG_COOKIE, lang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  // The router also caches the rendered page per path, so without this the
  // redirect would land on the cached copy in the previous language.
  revalidatePath("/", "layout");

  // Only ever redirect within this app: `path` comes from the browser.
  redirect(path.startsWith("/") && !path.startsWith("//") ? path : "/");
}
