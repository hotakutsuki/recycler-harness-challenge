import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { db } from "@/lib/db";
import { url } from "@/lib/storage";
import { getTranslator } from "@/lib/i18n.server";
import type { Translate } from "@/lib/i18n";
import { usingStub } from "@/lib/extractor";
import { check, persist } from "@/lib/pipeline";
import { describe as describeFlag } from "@/harness/messages";
import { Document, type Comprobante, type NumberField, type Tarjeta } from "@/harness/schema";
import type { Flag } from "@/harness/validate";
import { isBlocking } from "@/harness/validate";

/**
 * The review screen: the photo beside what was read, and what the checks make
 * of it.
 *
 * The design rule here is that the person is reviewing a *document*, not a form.
 * So the fields are laid out in the order they appear on the paper, each shows
 * what was literally written, and the failed checks are stated in the yard's own
 * terms — what the sheet says next to what the arithmetic says, and nothing
 * about which one is right. The system does not know: the paper may be wrong, or
 * the reading may be.
 */

interface FieldEdit {
  path: string;
  label: string;
  value: string;
}

const text = (field: NumberField | null | undefined): string =>
  field == null ? "" : field.legible ? field.raw : "";

/** Every editable number on the document, in the order it is written. */
function fields(doc: Document, t: Translate): FieldEdit[] {
  const out: FieldEdit[] = [];
  out.push({ path: "date_raw", label: t("field.date"), value: doc.date_raw ?? "" });

  if (doc.kind === "tarjeta") {
    out.push({ path: "card_number", label: t("field.number"), value: doc.card_number ?? "" });
    doc.lines.forEach((line, i) => {
      out.push({ path: `lines.${i}.quantity`, label: t("field.quantity"), value: text(line.quantity) });
      out.push({ path: `lines.${i}.material_raw`, label: t("field.material"), value: line.material_raw });
      out.push({ path: `lines.${i}.unit_price`, label: t("field.price"), value: text(line.unit_price) });
      out.push({ path: `lines.${i}.amount`, label: t("field.amount"), value: text(line.amount) });
    });
  } else {
    out.push({ path: "receipt_number", label: t("field.number"), value: doc.receipt_number ?? "" });
    out.push({ path: "material_raw", label: t("field.material"), value: doc.material_raw ?? "" });
    out.push({ path: "weighing.gross", label: t("field.gross"), value: text(doc.weighing.gross) });
    out.push({ path: "weighing.tare", label: t("field.tare"), value: text(doc.weighing.tare) });
    out.push({ path: "weighing.net", label: t("field.net"), value: text(doc.weighing.net) });
    doc.weighing.deductions.forEach((d, i) => {
      out.push({ path: `weighing.deductions.${i}.amount`, label: t("field.deduction"), value: text(d.amount) });
      out.push({ path: `weighing.deductions.${i}.reason`, label: t("field.reason"), value: d.reason ?? "" });
    });
    out.push({ path: "weighing.final_net", label: t("field.finalNet"), value: text(doc.weighing.final_net) });
  }

  out.push({ path: "settlement.total", label: t("field.total"), value: text(doc.settlement.total) });
  doc.settlement.payments.forEach((p, i) => {
    out.push({ path: `settlement.payments.${i}.amount`, label: t("field.payment", { kind: p.kind }), value: text(p.amount) });
  });
  out.push({ path: "settlement.owed", label: t("field.owed"), value: text(doc.settlement.owed) });
  return out;
}

const parseWritten = (raw: string): number | null => {
  const c = raw.trim();
  if (!/^-?[\d.,]+$/.test(c) || !/\d/.test(c)) return null;
  const sep = Math.max(c.lastIndexOf("."), c.lastIndexOf(","));
  if (sep === -1) return Number(c);
  const decimals = c.length - sep - 1;
  const normalized =
    decimals === 1 || decimals === 2
      ? c.slice(0, sep).replace(/[.,]/g, "") + "." + c.slice(sep + 1)
      : c.replace(/[.,]/g, "");
  return Number.isFinite(Number(normalized)) ? Number(normalized) : null;
};

/** Applies one edited field back onto the document, by its path. */
function applyEdit(doc: Document, path: string, raw: string): void {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let target: any = doc;
  for (const part of parts.slice(0, -1)) target = target[part];
  const key = parts[parts.length - 1]!;

  const current = target[key];
  const isNumberField =
    current && typeof current === "object" && "raw" in current && "legible" in current;

  if (isNumberField || ["quantity", "unit_price", "amount", "gross", "tare", "net", "final_net", "total", "owed"].includes(key)) {
    if (raw.trim() === "") {
      target[key] = null;
      return;
    }
    target[key] = {
      raw,
      value: parseWritten(raw),
      legible: true,
      replaces: current?.replaces ?? null,
    };
    return;
  }

  target[key] = raw.trim() === "" ? null : raw;
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { lang, t } = await getTranslator();

  const sheet = await db.sheet.findUnique({ where: { id }, include: { corrections: true } });
  if (!sheet) notFound();

  const raw = sheet.rawExtraction ? (JSON.parse(sheet.rawExtraction) as Document) : null;
  const current = sheet.correctedExtraction
    ? (JSON.parse(sheet.correctedExtraction) as Document)
    : raw;
  const flags: Flag[] = sheet.flags ? (JSON.parse(sheet.flags) as Flag[]) : [];

  async function save(formData: FormData) {
    "use server";

    const sheetNow = await db.sheet.findUnique({ where: { id } });
    if (!sheetNow?.rawExtraction) return;

    const base = sheetNow.correctedExtraction ?? sheetNow.rawExtraction;
    const edited = Document.parse(JSON.parse(base));
    const previous = Document.parse(JSON.parse(base));
    const corrections: { field: string; from: string; to: string }[] = [];

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("f.") || typeof value !== "string") continue;
      const path = key.slice(2);
      const before = fields(previous, t).find((f) => f.path === path)?.value ?? "";
      if (before === value) continue;
      applyEdit(edited, path, value);
      corrections.push({ field: path, from: before, to: value });
    }

    const { normalized, flags: newFlags } = await check(edited, id);
    const committing = formData.get("action") === "confirmar";

    if (committing) await persist(id, normalized);

    await db.sheet.update({
      where: { id },
      data: {
        correctedExtraction: JSON.stringify(edited),
        flags: JSON.stringify(newFlags),
        status: committing
          ? "committed"
          : isBlocking(newFlags)
            ? "needs_review"
            : "ready",
        committedAt: committing ? new Date() : null,
        corrections: {
          create: corrections.map((c) => ({
            field: c.field,
            fromValue: c.from,
            toValue: c.to,
            user: "counter",
          })),
        },
      },
    });

    redirect(`/review/${id}?saved=1`);
  }

  const editable = current ? fields(current, t) : [];
  const blocking = flags.filter((f) => f.severity === "blocking");
  const warnings = flags.filter((f) => f.severity === "warning");

  return (
    <>
      <AppHeader lang={lang} t={t} />
      <main className="wide">
        {usingStub() && <p className="stub">{t("review.stub")}</p>}
        {saved && <p className="saved">{t("common.saved")}</p>}

        <div className="review-doc">
          <div className="photo">
            <img src={url(sheet.photoPath)} alt="" />
          </div>

          <div>
            <h2 className="page">
              {current?.kind === "comprobante" ? t("doc.comprobante") : t("doc.tarjeta")}{" "}
              <span className={`badge ${sheet.status}`}>{t(`status.${sheet.status}`)}</span>
            </h2>

            {sheet.status === "failed" && <p className="error">{sheet.error}</p>}

            {flags.length > 0 && (
              <ul className="flags">
                {[...blocking, ...warnings].map((flag, i) => {
                  const { text: message, where, severity } = describeFlag(flag, t, lang === "es" ? "es-EC" : "en-US");
                  return (
                    <li key={i} className={flag.severity}>
                      <strong>{severity}</strong>
                      {where ? ` · ${where}` : ""} — {message}
                    </li>
                  );
                })}
              </ul>
            )}

            {current && (
              <form action={save}>
                <table className="fields">
                  <tbody>
                    {editable.map((field) => (
                      <tr key={field.path}>
                        <th>{field.label}</th>
                        <td>
                          <input name={`f.${field.path}`} defaultValue={field.value} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="actions">
                  <button type="submit" name="action" value="save" className="secondary">
                    {t("review.save")}
                  </button>
                  <button
                    type="submit"
                    name="action"
                    value="commit"
                    className="primary"
                    disabled={blocking.length > 0}
                  >
                    {t("review.commit")}
                  </button>
                </div>
                {blocking.length > 0 && <p className="hint">{t("review.blocked")}</p>}
              </form>
            )}

            {sheet.corrections.length > 0 && (
              <div className="audit">
                <h3>{t("review.corrections")}</h3>
                <ul>
                  {sheet.corrections.map((c) => (
                    <li key={c.id}>
                      <code>{c.field}</code>: {c.fromValue || "—"} → {c.toValue || "—"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export type { Tarjeta, Comprobante };
