import { useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import {
  maxLayoutSeats,
  maxRows,
  maxSeatsPerRow,
  maxSections,
  planBody,
  planProblem,
  planRowNumbers,
  planSeats,
} from "@biletflow/shared/features/seating/builder";
import type { LayoutPlan, PlanSection } from "@biletflow/shared/features/seating/builder";
import { useEventRequest } from "../events/data";
import { categoryLabelOf, knownCategories } from "./categories";
import { seatingCopy } from "./copy";
import type { Layout } from "./model";

let counter = 0;
const section = (name: string, category: string, rows: number, seatsPerRow: number): PlanSection => ({
  key: `s${++counter}`,
  name,
  category,
  rows,
  seatsPerRow,
});

const starter = (locale: Locale): LayoutPlan => ({
  name: "",
  sections: [
    section(locale === "en" ? "Parterre" : locale === "kk" ? "Партер" : "Партер", "standard", 8, 14),
    section(locale === "en" ? "Balcony" : locale === "kk" ? "Балкон" : "Балкон", "vip", 3, 10),
  ],
});

/**
 * Organizers build a hall from sections: name, price category, rows and seats per row. The
 * preview shows the plan the way buyers will see it, row 1 nearest the stage.
 */
export function LayoutBuilder({
  venueId,
  locale,
  onCreated,
  onCancel,
}: {
  venueId: string;
  locale: Locale;
  onCreated: (layout: Layout) => void;
  onCancel: () => void;
}) {
  const t = seatingCopy[locale];
  const request = useEventRequest();
  const id = useId();
  const [plan, setPlan] = useState<LayoutPlan>(() => starter(locale));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<"layoutExists" | "buildError" | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const problem = planProblem(plan);
  const seats = planSeats(plan);
  const rowNumbers = planRowNumbers(plan);
  const categories = [...new Set(plan.sections.map((s) => s.category.trim().toLowerCase()))];
  const tone = (category: string) =>
    Math.max(0, categories.indexOf(category.trim().toLowerCase())) % 4;
  const problemText =
    problem === "clash"
      ? t.sectionNamesClash
      : problem === "tooMany"
        ? t.tooManySeats
        : problem
          ? t.fillFields
          : null;

  function update(key: string, change: Partial<PlanSection>) {
    setError(null);
    setPlan((p) => ({
      ...p,
      sections: p.sections.map((s) => (s.key === key ? { ...s, ...change } : s)),
    }));
  }

  async function create() {
    setTried(true);
    if (busy || problem) {
      errorRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const layout = (await request(`/api/v1/venues/${encodeURIComponent(venueId)}/layouts`, {
        method: "POST",
        body: planBody(plan),
      })) as Layout;
      onCreated(layout);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409 ? "layoutExists" : "buildError");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="seat-builder panel" aria-labelledby={`${id}-title`}>
      <header className="seat-builder-head">
        <h2 id={`${id}-title`}>{t.build}</h2>
        <p>{t.buildHint}</p>
      </header>
      <form
        className="seat-builder-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <fieldset className="seat-builder-fields" disabled={busy}>
          <legend className="visually-hidden">{t.build}</legend>
          <label className="seat-builder-name">
            {t.layoutName}
            <input
              value={plan.name}
              maxLength={80}
              required
              aria-invalid={tried && problem === "name"}
              placeholder={locale === "en" ? "Main hall" : locale === "kk" ? "Үлкен зал" : "Большой зал"}
              onChange={(e) => {
                setError(null);
                setPlan((p) => ({ ...p, name: e.target.value }));
              }}
            />
          </label>
          <ol className="seat-builder-sections">
            {plan.sections.map((s, i) => (
              <li key={s.key} data-tone={tone(s.category)}>
                <span className="seat-builder-rows" aria-hidden="true">
                  {rowNumbers[i]?.length
                    ? rowNumbers[i]!.length > 1
                      ? `${rowNumbers[i]![0]}–${rowNumbers[i]!.at(-1)}`
                      : rowNumbers[i]![0]
                    : "–"}
                </span>
                <label>
                  {t.sectionName}
                  <input
                    value={s.name}
                    maxLength={60}
                    aria-invalid={tried && !s.name.trim()}
                    onChange={(e) => update(s.key, { name: e.target.value })}
                  />
                </label>
                <label>
                  {t.category}
                  <select
                    value={s.category}
                    onChange={(e) => update(s.key, { category: e.target.value })}
                  >
                    {knownCategories.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabelOf(c, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.rows}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxRows}
                    value={Number.isNaN(s.rows) ? "" : s.rows}
                    aria-invalid={tried && !(s.rows >= 1 && s.rows <= maxRows)}
                    onChange={(e) => update(s.key, { rows: e.target.valueAsNumber })}
                  />
                </label>
                <label>
                  {t.seatsPerRow}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxSeatsPerRow}
                    value={Number.isNaN(s.seatsPerRow) ? "" : s.seatsPerRow}
                    aria-invalid={tried && !(s.seatsPerRow >= 1 && s.seatsPerRow <= maxSeatsPerRow)}
                    onChange={(e) => update(s.key, { seatsPerRow: e.target.valueAsNumber })}
                  />
                </label>
                <button
                  type="button"
                  className="seat-remove"
                  disabled={plan.sections.length < 2}
                  aria-label={`${t.removeSection}: ${s.name || i + 1}`}
                  onClick={() =>
                    setPlan((p) => ({ ...p, sections: p.sections.filter((x) => x.key !== s.key) }))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          {plan.sections.length < maxSections && (
            <button
              type="button"
              className="secondary seat-builder-add"
              onClick={() =>
                setPlan((p) => ({
                  ...p,
                  sections: [...p.sections, section("", "standard", 4, 10)],
                }))
              }
            >
              + {t.addSection}
            </button>
          )}
        </fieldset>

        <div className="seat-builder-preview" aria-hidden="true">
          <div className="seat-builder-stage">{t.stage}</div>
          {plan.sections.map((s, i) => (
            <div className="seat-builder-block" key={s.key} data-tone={tone(s.category)}>
              <span>
                {s.name || "…"} · {categoryLabelOf(s.category, locale)}
              </span>
              {rowNumbers[i]!.map((n) => (
                <div className="seat-builder-row" key={n}>
                  <small>{n}</small>
                  <i style={{ "--n": Math.min(Math.max(s.seatsPerRow || 0, 0), maxSeatsPerRow) } as CSSProperties} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <footer className="seat-builder-foot">
          <strong className="seat-builder-count" data-over={seats > maxLayoutSeats}>
            {seats.toLocaleString(locale)} {t.seatsTotal}
          </strong>
          <p
            className="form-error"
            role="alert"
            tabIndex={-1}
            ref={errorRef}
            hidden={!(error || (tried && problemText))}
          >
            {error ? t[error] : tried ? problemText : null}
          </p>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </button>
          <button type="submit" disabled={busy}>
            {busy ? t.creating : t.createLayout}
          </button>
        </footer>
      </form>
    </section>
  );
}
