import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, formatMoney, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { api } from "../api";
import { config } from "../config";
import { scenarios, setScenario } from "../mocks/handlers";
import type { Scenario } from "../mocks/handlers";

const copy = {
  kk: {
    scenario: "Сынақ жағдайы",
    read: "Тізімді оқу",
    write: "Сынақ өзгерісін жіберу",
    note: "Бұл бет әзірлеу кезінде ғана қолжетімді. Тіркелгіге кіру әлі іске асырылмаған.",
  },
  ru: {
    scenario: "Сценарий проверки",
    read: "Прочитать список",
    write: "Отправить тестовое изменение",
    note: "Страница доступна только при разработке. Вход в аккаунт ещё не реализован.",
  },
  en: {
    scenario: "Test scenario",
    read: "Read list",
    write: "Send mock mutation",
    note: "This page is available only during development. Account sign-in is not implemented yet.",
  },
};
export default function FoundationPage({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const c = copy[locale];
  const [scenario, selectScenario] = useState<Scenario>("success");
  const request = useMutation({
    mutationFn: async (operation: "health" | "read" | "write") => {
      if (operation === "write") {
        if (!config.useMocks)
          throw new Error("Mock mutations require VITE_ENABLE_MOCKS=true.");
        return api.request<components["schemas"]["UserOut"]>("/api/v1/me", {
          method: "PATCH",
          body: {
            full_name: "F0 demo organizer",
            phone: null,
          } satisfies components["schemas"]["UserUpdate"],
        });
      }
      return api.request(operation === "health" ? "/health" : "/api/v1/events");
    },
  });
  const error = request.error;
  return (
    <>
      <h1>{t.foundationTitle}</h1>
      <p>{c.note}</p>
      <p className="notice">
        <strong>{config.useMocks ? t.mockMode : t.liveMode}</strong> ·{" "}
        {t.sessionStatus}: {t.signedOut}
      </p>
      <p>{formatMoney(125050, locale)} · KZT · Asia/Almaty</p>
      <div className="controls">
        {config.useMocks ? (
          <label>
            {c.scenario}
            <select
              value={scenario}
              onChange={(e) => {
                const next = e.target.value as Scenario;
                selectScenario(next);
                setScenario(next);
                request.reset();
              }}
            >
              {scenarios.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          disabled={request.isPending}
          onClick={() => request.mutate("health")}
        >
          {t.checkApi}
        </button>
        <button
          disabled={request.isPending}
          onClick={() => request.mutate("read")}
        >
          {c.read}
        </button>
        <button
          disabled={!config.useMocks || request.isPending}
          onClick={() => request.mutate("write")}
        >
          {c.write}
        </button>
      </div>
      {request.isPending ? <p role="status">{t.checking}</p> : null}
      {request.isSuccess ? (
        <section aria-label={t.ready}>
          <h2>{t.ready}</h2>
          <pre>{JSON.stringify(request.data, null, 2)}</pre>
        </section>
      ) : null}
      {error ? (
        <section role="alert">
          <h2>{t.error}</h2>
          <p>
            {error instanceof ApiError && error.status === 0
              ? t.networkError
              : t.unknownError}
          </p>
          {error instanceof ApiError ? (
            <pre>
              {JSON.stringify(
                {
                  status: error.status,
                  code: error.code,
                  details: error.details,
                  requestId: error.requestId,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
