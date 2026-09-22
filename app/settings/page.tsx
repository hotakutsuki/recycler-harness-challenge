import { revalidatePath } from "next/cache";
import { AppHeader } from "@/components/AppHeader";
import { db } from "@/lib/db";
import { getTranslator } from "@/lib/i18n.server";
import type { Unit } from "@/harness/schema";

const UNITS: Unit[] = ["kg", "lb", "qq", "t"];

/**
 * The configuration screen.
 *
 * This is where the yard's own vocabulary and prices live, and it is what makes
 * normalization possible at all: without the aliases, "chat liv" is just a string.
 * It is plain HTML forms with server actions — no client state, no save button that
 * might or might not have worked. One form, one submit, one confirmation.
 */

async function saveSettings(formData: FormData) {
  "use server";

  const num = (name: string, fallback: number) => {
    const parsed = Number(formData.get(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  await db.config.update({
    where: { id: 1 },
    data: {
      cashRounding: num("cashRounding", 0.05),
      bulkPriceMin: num("bulkPriceMin", 0.12),
      bulkPriceMax: num("bulkPriceMax", 0.45),
      photoRetentionDays: Math.round(num("photoRetentionDays", 90)),
    },
  });

  const materials = await db.material.findMany({ select: { id: true } });
  for (const { id } of materials) {
    const price = Number(formData.get(`price.${id}`));
    const priceMin = Number(formData.get(`min.${id}`));
    const priceMax = Number(formData.get(`max.${id}`));
    const unit = String(formData.get(`unit.${id}`) ?? "");
    const name = String(formData.get(`name.${id}`) ?? "").trim();
    const aliases = String(formData.get(`aliases.${id}`) ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const numbersOk = [price, priceMin, priceMax].every((v) => Number.isFinite(v) && v >= 0);
    if (!name || !UNITS.includes(unit as Unit) || !numbersOk || priceMin > priceMax) {
      continue; // A malformed row is left untouched rather than half-saved.
    }

    await db.material.update({
      where: { id },
      data: {
        name,
        price,
        unit,
        priceMin,
        priceMax,
        // Aliases are replaced wholesale: the textarea is the full list, and
        // diffing it would only make the save harder to reason about.
        aliases: { deleteMany: {}, create: aliases.map((text) => ({ text })) },
      },
    });
  }

  revalidatePath("/settings");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { lang, t } = await getTranslator();
  const { saved } = await searchParams;

  const [config, materials] = await Promise.all([
    db.config.findUnique({ where: { id: 1 } }),
    db.material.findMany({ include: { aliases: true }, orderBy: { position: "asc" } }),
  ]);

  return (
    <>
      <AppHeader lang={lang} t={t} />
      <main>
        <h2 className="page">{t("settings.title")}</h2>
        {saved != null && <p className="saved">{t("common.saved")}</p>}

        <form action={saveSettings}>
          <section className="panel">
            <h3>{t("settings.materials")}</h3>
            <p className="hint">
              {t("settings.materials.hint")} {t("settings.aliases.hint")}
            </p>

            {materials.map((material) => (
              <div className="material" key={material.id}>
                <label className="field name">
                  <span>{t("settings.material")}</span>
                  <input name={`name.${material.id}`} defaultValue={material.name} required />
                </label>

                <label className="field price">
                  <span>{t("settings.price")}</span>
                  <input
                    name={`price.${material.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    defaultValue={material.price}
                    required
                  />
                </label>

                <label className="field unit">
                  <span>{t("settings.unit")}</span>
                  <select name={`unit.${material.id}`} defaultValue={material.unit}>
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {t(`settings.unit.${unit}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field range">
                  <span>{t("settings.priceRange")}</span>
                  <span className="withsuffix">
                    <input name={`min.${material.id}`} type="number" step="0.01" min="0"
                      inputMode="decimal" defaultValue={material.priceMin} aria-label={t("settings.min")} />
                    <em>–</em>
                    <input name={`max.${material.id}`} type="number" step="0.01" min="0"
                      inputMode="decimal" defaultValue={material.priceMax} aria-label={t("settings.max")} />
                  </span>
                </label>

                <label className="field aliases">
                  <span>{t("settings.aliases")}</span>
                  <input
                    name={`aliases.${material.id}`}
                    defaultValue={material.aliases.map((a) => a.text).join(", ")}
                    placeholder="chat liv, chat. liv."
                  />
                </label>
              </div>
            ))}
          </section>

          <section className="panel">
            <h3>{t("settings.checks")}</h3>
            <p className="hint">{t("settings.priceRange.hint")}</p>

            <label className="field wide">
              <span>{t("settings.rounding")}</span>
              <span className="withsuffix">
                <em>$</em>
                <input
                  name="cashRounding"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  defaultValue={config?.cashRounding ?? 0.05}
                />
              </span>
              <small>{t("settings.rounding.hint")}</small>
            </label>

            <label className="field wide">
              <span>{t("settings.bulkBand")}</span>
              <span className="withsuffix">
                <input name="bulkPriceMin" type="number" step="0.01" min="0" inputMode="decimal"
                  defaultValue={config?.bulkPriceMin ?? 0.12} aria-label={t("settings.min")} />
                <em>–</em>
                <input name="bulkPriceMax" type="number" step="0.01" min="0" inputMode="decimal"
                  defaultValue={config?.bulkPriceMax ?? 0.45} aria-label={t("settings.max")} />
              </span>
              <small>{t("settings.bulkBand.hint")}</small>
            </label>

            <label className="field wide">
              <span>{t("settings.retention")}</span>
              <span className="withsuffix">
                <input
                  name="photoRetentionDays"
                  type="number"
                  step="1"
                  min="1"
                  inputMode="numeric"
                  defaultValue={config?.photoRetentionDays ?? 90}
                />
                <em>{t("settings.days")}</em>
              </span>
              <small>{t("settings.retention.hint")}</small>
            </label>
          </section>

          <button className="primary" type="submit">
            {t("common.save")}
          </button>
        </form>
      </main>
    </>
  );
}
