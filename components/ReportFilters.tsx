import type { Translate } from "@/lib/i18n";

/**
 * Filters, as a plain GET form.
 *
 * No client state: the filter is in the URL, so a filtered report can be sent to
 * someone, bookmarked, or reloaded without losing it — which is what the office
 * actually does with a number it wants to discuss.
 */
export interface ReportFilter {
  from?: string;
  to?: string;
  kind?: string;
  material?: string;
  counterparty?: string;
}

export function ReportFilters({
  filter,
  materials,
  counterparties,
  t,
}: {
  filter: ReportFilter;
  materials: { id: string; name: string }[];
  counterparties: string[];
  t: Translate;
}) {
  const active = Object.values(filter).some(Boolean);

  return (
    <form className="filters" method="get">
      <label>
        <span>{t("filters.from")}</span>
        <input type="date" name="from" defaultValue={filter.from ?? ""} />
      </label>
      <label>
        <span>{t("filters.to")}</span>
        <input type="date" name="to" defaultValue={filter.to ?? ""} />
      </label>
      <label>
        <span>{t("filters.kind")}</span>
        <select name="kind" defaultValue={filter.kind ?? ""}>
          <option value="">{t("filters.any")}</option>
          <option value="tarjeta">{t("doc.tarjeta")}</option>
          <option value="comprobante">{t("doc.comprobante")}</option>
        </select>
      </label>
      <label>
        <span>{t("filters.material")}</span>
        <select name="material" defaultValue={filter.material ?? ""}>
          <option value="">{t("filters.any")}</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("filters.counterparty")}</span>
        <select name="counterparty" defaultValue={filter.counterparty ?? ""}>
          <option value="">{t("filters.any")}</option>
          {counterparties.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {counterparties.length === 0 && <small>{t("filters.noCounterparties")}</small>}
      </label>

      <div className="filter-actions">
        <button type="submit" className="secondary">
          {t("filters.apply")}
        </button>
        {active && (
          <a className="clear" href="/reports">
            {t("filters.clear")}
          </a>
        )}
      </div>
    </form>
  );
}
