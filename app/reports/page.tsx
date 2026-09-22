import { AppHeader } from "@/components/AppHeader";
import { RankedBars, StackedDays } from "@/components/charts";
import { ReportFilters, type ReportFilter } from "@/components/ReportFilters";
import { db } from "@/lib/db";
import { getTranslator } from "@/lib/i18n.server";

/**
 * The report.
 *
 * Deliberately three questions and no more: what material came in, what money
 * went out, and who is still owed. That is what this yard reconstructs by hand
 * from a stack of paper every month, and it is the whole reason to digitize any
 * of this. Anything else belongs to the yard-management system that comes after,
 * and the owner should be the one to specify it.
 *
 * Only committed documents count. A number on this page is one a person has
 * looked at and accepted — and the page says so out loud, along with how many
 * are still waiting, because a total that quietly omits a third of the week is
 * worse than no total at all.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilter>;
}) {
  const { lang, t } = await getTranslator();
  const filter = await searchParams;

  // A material filter matches either a tarjeta line or a whole truck load of it,
  // because "how much copper did we buy" should not depend on which piece of
  // paper it arrived on.
  const materialWhere = filter.material
    ? {
        OR: [
          { bulkMaterialId: filter.material },
          { lines: { some: { materialId: filter.material } } },
        ],
      }
    : {};

  const [events, pending, config] = await Promise.all([
    db.weighingEvent.findMany({
      where: {
        sheet: { status: "committed" },
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.counterparty ? { counterparty: filter.counterparty } : {}),
        ...(filter.from || filter.to
          ? {
              date: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
        ...materialWhere,
      },
      include: { lines: { include: { material: true } } },
      orderBy: { date: "asc" },
    }),
    db.sheet.count({ where: { status: { in: ["queued", "extracting", "needs_review", "ready", "failed"] } } }),
    db.config.findUnique({ where: { id: 1 } }),
  ]);

  const materials = await db.material.findMany({ orderBy: { position: "asc" } });
  const nameOf = new Map(materials.map((m) => [m.id, m.name]));

  const counterparties = (
    await db.weighingEvent.findMany({
      where: { counterparty: { not: null }, sheet: { status: "committed" } },
      select: { counterparty: true },
      distinct: ["counterparty"],
    })
  )
    .map((e) => e.counterparty)
    .filter((c): c is string => Boolean(c))
    .sort();

  const locale = lang === "es" ? "es-EC" : "en-US";
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: config?.currency ?? "USD",
  });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  // --- material que entró ---------------------------------------------------
  const byMaterial = new Map<string, { name: string; quantity: number; amount: number; docs: number }>();
  const add = (id: string | null, fallback: string, quantity: number | null, amount: number | null) => {
    const key = id ?? `?${fallback.toLowerCase()}`;
    const entry = byMaterial.get(key) ?? {
      name: id ? (nameOf.get(id) ?? fallback) : fallback,
      quantity: 0,
      amount: 0,
      docs: 0,
    };
    entry.quantity += quantity ?? 0;
    entry.amount += amount ?? 0;
    entry.docs += 1;
    byMaterial.set(key, entry);
  };

  for (const event of events) {
    if (event.kind === "comprobante") {
      // A truck load is one material, weighed whole; the price was never written.
      add(event.bulkMaterialId, event.bulkMaterialId ? "" : "—", event.finalNet ?? event.truckNet, event.total);
    } else {
      for (const line of event.lines) {
        if (filter.material && line.materialId !== filter.material) continue;
        add(line.materialId, line.materialRaw, line.quantity, line.amount);
      }
    }
  }

  const rows = [...byMaterial.values()].sort((a, b) => b.amount - a.amount);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  // --- dinero que salió -----------------------------------------------------
  const byDay = new Map<string, { bought: number; paid: number; owed: number; docs: number }>();
  for (const event of events) {
    const day = event.date ?? "—";
    const entry = byDay.get(day) ?? { bought: 0, paid: 0, owed: 0, docs: 0 };
    const total = event.total ?? 0;
    // A balance bigger than the purchase is the supplier's running account, not
    // this purchase's remainder — counting it here would overstate the day.
    const remainder = event.owed != null && event.owed <= total ? event.owed : 0;
    entry.bought += total;
    // When nothing is written about payment, the whole amount was handed over.
    entry.paid += event.paid ?? total - remainder;
    entry.owed += remainder;
    entry.docs += 1;
    byDay.set(day, entry);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const withBalance = events.filter((e) => (e.owed ?? 0) > 0);
  const owing = withBalance.filter((e) => (e.owed ?? 0) <= (e.total ?? 0));
  const accumulated = withBalance.filter((e) => (e.owed ?? 0) > (e.total ?? 0));
  const totalOwed = owing.reduce((s, e) => s + (e.owed ?? 0), 0);

  return (
    <>
      <AppHeader lang={lang} t={t} />
      <main className="wide">
        <h2 className="page">{t("reports.title")}</h2>

        <ReportFilters filter={filter} materials={materials} counterparties={counterparties} t={t} />

        <p className="basis">
          {t("reports.basis", { committed: events.length })}
          {pending > 0 ? ` ${t("reports.pending", { pending })}` : ""}
        </p>

        {events.length === 0 ? (
          <p className="empty">{t("reports.empty")}</p>
        ) : (
          <>
            <section className="panel">
              <h3>{t("reports.materials")}</h3>
              <p className="hint">{t("reports.materials.hint")}</p>
              <RankedBars
                data={rows.map((r) => ({ label: r.name || t("reports.unknownMaterial"), value: r.amount }))}
                format={(n) => money.format(n)}
                otherLabel={t("reports.other")}
              />
              <table className="report">
                <thead>
                  <tr>
                    <th>{t("settings.material")}</th>
                    <th className="n">{t("reports.quantity")}</th>
                    <th className="n">{t("reports.documents")}</th>
                    <th className="n">{t("reports.paid")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name || t("reports.unknownMaterial")}</td>
                      <td className="n">{number.format(row.quantity)}</td>
                      <td className="n">{row.docs}</td>
                      <td className="n">{money.format(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>{t("reports.total")}</th>
                    <th className="n">{money.format(totalAmount)}</th>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="panel">
              <h3>{t("reports.cash")}</h3>
              <p className="hint">{t("reports.cash.hint")}</p>
              <StackedDays
                data={days.map(([day, d]) => ({ day, paid: d.paid, owed: d.owed }))}
                format={(n) => money.format(n)}
                labels={{ paid: t("reports.handedOver"), owed: t("reports.stillOwed") }}
              />
              <table className="report">
                <thead>
                  <tr>
                    <th>{t("reports.day")}</th>
                    <th className="n">{t("reports.documents")}</th>
                    <th className="n">{t("reports.bought")}</th>
                    <th className="n">{t("reports.handedOver")}</th>
                    <th className="n">{t("reports.stillOwed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(([day, d]) => (
                    <tr key={day}>
                      <td>{day}</td>
                      <td className="n">{d.docs}</td>
                      <td className="n">{money.format(d.bought)}</td>
                      <td className="n">{money.format(d.paid)}</td>
                      <td className="n">{d.owed > 0 ? money.format(d.owed) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h3>{t("reports.balances")}</h3>
              <p className="hint">{t("reports.balances.hint")}</p>
              {owing.length === 0 ? (
                <p className="hint">{t("reports.noBalances")}</p>
              ) : (
                <table className="report">
                  <thead>
                    <tr>
                      <th>{t("reports.document")}</th>
                      <th>{t("reports.day")}</th>
                      <th className="n">{t("reports.bought")}</th>
                      <th className="n">{t("reports.stillOwed")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owing.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.folio ?? "—"} <span className="kind">{t(`doc.${e.kind}`)}</span>
                        </td>
                        <td>{e.date ?? "—"}</td>
                        <td className="n">{money.format(e.total ?? 0)}</td>
                        <td className="n">{money.format(e.owed ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>{t("reports.total")}</th>
                      <th className="n">{money.format(totalOwed)}</th>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            {accumulated.length > 0 && (
              <section className="panel">
                <h3>{t("reports.accumulated")}</h3>
                <p className="hint">{t("reports.accumulated.hint")}</p>
                <table className="report">
                  <thead>
                    <tr>
                      <th>{t("reports.document")}</th>
                      <th>{t("reports.day")}</th>
                      <th className="n">{t("reports.bought")}</th>
                      <th className="n">{t("reports.stillOwed")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accumulated.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.folio ?? "—"} <span className="kind">{t(`doc.${e.kind}`)}</span>
                        </td>
                        <td>{e.date ?? "—"}</td>
                        <td className="n">{money.format(e.total ?? 0)}</td>
                        <td className="n">{money.format(e.owed ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
