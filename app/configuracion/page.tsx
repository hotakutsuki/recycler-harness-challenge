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
      tolerancePct: num("tolerancePct", 10),
      priceDivergencePct: num("priceDivergencePct", 10),
      photoRetentionDays: Math.round(num("photoRetentionDays", 90)),
    },
  });

  const materials = await db.material.findMany({ select: { id: true } });
  for (const { id } of materials) {
    const price = Number(formData.get(`price.${id}`));
    const priceUnit = String(formData.get(`unit.${id}`) ?? "");
    const name = String(formData.get(`name.${id}`) ?? "").trim();
    const aliases = String(formData.get(`aliases.${id}`) ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    if (!name || !UNITS.includes(priceUnit as Unit) || !Number.isFinite(price) || price < 0) {
      continue; // A malformed row is left untouched rather than half-saved.
    }

    await db.material.update({
      where: { id },
      data: {
        name,
        price,
        priceUnit,
        // Aliases are replaced wholesale: the textarea is the full list, and
        // diffing it would only make the save harder to reason about.
        aliases: { deleteMany: {}, create: aliases.map((text) => ({ text })) },
      },
    });
  }

  revalidatePath("/configuracion");
}

export default async function ConfiguracionPage({
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
                  <span>{t("settings.priceUnit")}</span>
                  <select name={`unit.${material.id}`} defaultValue={material.priceUnit}>
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {t(`settings.unit.${unit}`)}
                      </option>
                    ))}
                  </select>
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

            <label className="field wide">
              <span>{t("settings.tolerance")}</span>
              <span className="withsuffix">
                <input
                  name="tolerancePct"
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  defaultValue={config?.tolerancePct ?? 10}
                />
                <em>%</em>
              </span>
              <small>{t("settings.tolerance.hint")}</small>
            </label>

            <label className="field wide">
              <span>{t("settings.priceDivergence")}</span>
              <span className="withsuffix">
                <input
                  name="priceDivergencePct"
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  defaultValue={config?.priceDivergencePct ?? 10}
                />
                <em>%</em>
              </span>
              <small>{t("settings.priceDivergence.hint")}</small>
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
