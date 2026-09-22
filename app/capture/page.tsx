import { AppHeader } from "@/components/AppHeader";
import { Capture } from "@/components/Capture";
import { getTranslator } from "@/lib/i18n.server";

/**
 * The capture screen is a server component that hands the client component its
 * strings. Keeping the dictionary on the server means the browser never downloads
 * the language it is not using — and the client component stays about uploading,
 * with no opinion on language.
 */
export default async function CapturePage() {
  const { lang, t } = await getTranslator();

  return (
    <>
      <AppHeader lang={lang} t={t} />
      <Capture
        locale={lang === "es" ? "es-EC" : "en-US"}
        labels={{
          button: t("capture.button"),
          hint: t("capture.hint"),
          empty: t("capture.empty"),
          uploading: t("capture.uploading"),
          failed: t("capture.failed"),
          review: t("capture.review"),
          status: {
            queued: t("status.queued"),
            extracting: t("status.extracting"),
            needs_review: t("status.needs_review"),
            ready: t("status.ready"),
            committed: t("status.committed"),
            failed: t("status.failed"),
          },
        }}
      />
    </>
  );
}
