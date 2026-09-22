import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { db } from "@/lib/db";
import { url } from "@/lib/storage";
import { getTranslator } from "@/lib/i18n.server";
import { recoverInterrupted } from "@/lib/worker";
import type { Flag } from "@/harness/validate";

/**
 * The inbox.
 *
 * Ordered by what needs a person first, not by when it arrived: a sheet that
 * cannot be committed is the only thing anyone has to act on, and burying it
 * under twenty that are fine is how a review queue stops being read.
 */

const ORDER: Record<string, number> = {
  needs_review: 0,
  failed: 1,
  extracting: 2,
  queued: 3,
  ready: 4,
  committed: 5,
};

export default async function InboxPage() {
  await recoverInterrupted();
  const { lang, t } = await getTranslator();

  const sheets = await db.sheet.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { event: { select: { kind: true, folio: true, date: true, total: true } } },
  });

  const sorted = [...sheets].sort(
    (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9),
  );

  const money = new Intl.NumberFormat(lang === "es" ? "es-EC" : "en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <>
      <AppHeader lang={lang} t={t} />
      <main className="wide">
        <h2 className="page">{t("review.title")}</h2>

        {sorted.length === 0 ? (
          <p className="empty">{t("review.empty")}</p>
        ) : (
          <ul className="inbox">
            {sorted.map((sheet) => {
              const flags: Flag[] = sheet.flags ? (JSON.parse(sheet.flags) as Flag[]) : [];
              const blocking = flags.filter((f) => f.severity === "blocking").length;
              const warnings = flags.length - blocking;

              return (
                <li key={sheet.id}>
                  <Link href={`/review/${sheet.id}`}>
                    <img src={url(sheet.photoPath)} alt="" />
                    <div className="info">
                      <strong>
                        {sheet.event?.folio ?? "—"}{" "}
                        <span className="kind">
                          {sheet.event?.kind
                            ? t(`doc.${sheet.event.kind}`)
                            : t(`status.${sheet.status}`)}
                        </span>
                      </strong>
                      <span className="sub">
                        {sheet.event?.date ?? ""}
                        {sheet.event?.total != null ? ` · ${money.format(sheet.event.total)}` : ""}
                      </span>
                      <span className="counts">
                        {blocking > 0 && <em className="b">{blocking}</em>}
                        {warnings > 0 && <em className="w">{warnings}</em>}
                      </span>
                    </div>
                    <span className={`badge ${sheet.status}`}>{t(`status.${sheet.status}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
