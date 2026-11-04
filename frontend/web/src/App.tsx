import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { isLocale, localeLabels, locales, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";

const FoundationPage = import.meta.env.DEV
  ? lazy(() => import("./dev/FoundationPage"))
  : null;
export default function App() {
  const [locale, setLocale] = useState<Locale>("kk");
  const t = messages[locale];
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main">
        {locale === "kk"
          ? "Мазмұнға өту"
          : locale === "ru"
            ? "К содержимому"
            : "Skip to content"}
      </a>
      <header className="site-header">
        <Link className="brand" to="/">
          BiletFlow
        </Link>
        <label className="language-control">
          {t.language}
          <select
            value={locale}
            onChange={(e) => {
              if (isLocale(e.target.value)) setLocale(e.target.value);
            }}
          >
            {locales.map((code) => (
              <option key={code} value={code}>
                {localeLabels[code]}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main id="main" className="page">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h1>BiletFlow</h1>
                <p>{t.notImplemented}</p>
                {FoundationPage ? (
                  <Link to="/dev/foundation">{t.foundationTitle}</Link>
                ) : null}
              </>
            }
          />
          {FoundationPage ? (
            <Route
              path="/dev/foundation"
              element={
                <Suspense fallback={<p role="status">{t.checking}</p>}>
                  <FoundationPage locale={locale} />
                </Suspense>
              }
            />
          ) : null}
          <Route
            path="*"
            element={
              <>
                <h1>404</h1>
                <p>{t.notImplemented}</p>
                <Link to="/">BiletFlow</Link>
              </>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
