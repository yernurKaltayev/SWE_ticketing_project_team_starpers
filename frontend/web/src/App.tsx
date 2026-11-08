import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { isLocale, localeLabels, locales, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { config } from "./config";
import { AuthPage } from "./auth/AuthPage";
import type { AuthKind } from "./auth/AuthPage";
import { ProfilePage, OrganizerPage } from "./auth/ProfilePage";
import { authCopy } from "./auth/copy";
import { hasRole, safeReturnTo } from "./auth/helpers";
import { SessionProvider } from "./auth/SessionProvider";
import { useSession } from "./auth/session";
import { Status } from "./auth/ui";

import { EventList } from "./events/Discovery";
import { EventDetail } from "./events/Detail";
import { EventEditor } from "./events/Editor";
import { eventCopy } from "./events/copy";
import { commerceNavigation } from "./checkout/navigation";

const Checkout = lazy(() => import("./checkout/CheckoutPage"));
const Orders = lazy(() => import("./checkout/Orders"));
const OrderDetail = lazy(() =>
  import("./checkout/Orders").then((m) => ({ default: m.OrderDetail })),
);
const Tickets = lazy(() => import("./checkout/Tickets"));
const TicketDetail = lazy(() =>
  import("./checkout/Tickets").then((m) => ({ default: m.TicketDetail })),
);

const FoundationPage = import.meta.env.DEV
  ? lazy(() => import("./dev/FoundationPage"))
  : null;
const authKinds: AuthKind[] = [
  "login",
  "register",
  "verify-email",
  "forgot-password",
  "reset-password",
];

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Application />
      </SessionProvider>
    </BrowserRouter>
  );
}

function Application() {
  const [locale, setLocale] = useState<Locale>("kk");
  const [logoutError, setLogoutError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { user, controller } = useSession();
  const t = authCopy[locale];
  const location = useLocation();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    document.title = "BiletFlow";
    document.getElementById("main")?.focus();
  }, [location.pathname]);
  return (
    <>
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
        <nav className="site-nav" aria-label="BiletFlow">
          <Link to="/events">{eventCopy[locale].events}</Link>
          {hasRole(user, ["organizer"]) && (
            <Link to="/organizer/events">{eventCopy[locale].organizer}</Link>
          )}
          {user ? (
            <>
              <Link to="/account">{t.account}</Link>
              <Link to="/account/orders">
                {commerceNavigation[locale].orders}
              </Link>
              <Link to="/account/tickets">
                {commerceNavigation[locale].tickets}
              </Link>
              {hasRole(user, ["organizer"]) ? (
                <Link to="/organizer/profile">{t.organizer}</Link>
              ) : null}
              <button
                className="secondary"
                disabled={loggingOut}
                onClick={() => {
                  setLoggingOut(true);
                  setLogoutError(false);
                  void controller
                    .logout()
                    .catch(() => setLogoutError(true))
                    .finally(() => setLoggingOut(false));
                }}
              >
                {loggingOut ? t.working : t.logout}
              </button>
            </>
          ) : (
            <>
              <Link
                to={`/login?returnTo=${encodeURIComponent(safeReturnTo(location.pathname + location.search))}`}
              >
                {t.login}
              </Link>
              <Link to="/register">{t.register}</Link>
            </>
          )}
        </nav>
        <label className="language-control">
          {messages[locale].language}
          <select
            value={locale}
            onChange={(event) => {
              if (isLocale(event.target.value)) setLocale(event.target.value);
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
      <main id="main" className="page" tabIndex={-1}>
        {config.useMocks ? (
          <p className="environment-notice">{t.mockNotice}</p>
        ) : null}
        {logoutError ? <Status>{t.logoutFailed}</Status> : null}
        <Routes>
          <Route
            path="/events/:eventId/checkout"
            element={
              <RequireSession locale={locale}>
                <Suspense fallback={<Status>{t.loading}</Status>}>
                  <Checkout key={user?.id} locale={locale} />
                </Suspense>
              </RequireSession>
            }
          />
          <Route
            path="/account/orders"
            element={
              <RequireSession locale={locale}>
                <Suspense fallback={<Status>{t.loading}</Status>}>
                  <Orders key={user?.id} locale={locale} />
                </Suspense>
              </RequireSession>
            }
          />
          {["/account/orders/:orderId", "/orders/:orderId/status"].map(
            (path) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireSession locale={locale}>
                    <Suspense fallback={<Status>{t.loading}</Status>}>
                      <OrderDetail key={user?.id} locale={locale} />
                    </Suspense>
                  </RequireSession>
                }
              />
            ),
          )}
          <Route
            path="/account/tickets"
            element={
              <RequireSession locale={locale}>
                <Suspense fallback={<Status>{t.loading}</Status>}>
                  <Tickets key={user?.id} locale={locale} />
                </Suspense>
              </RequireSession>
            }
          />
          <Route
            path="/account/tickets/:ticketId"
            element={
              <RequireSession locale={locale}>
                <Suspense fallback={<Status>{t.loading}</Status>}>
                  <TicketDetail key={user?.id} locale={locale} />
                </Suspense>
              </RequireSession>
            }
          />
          <Route
            path="/"
            element={<EventList key={user?.id ?? "public"} locale={locale} />}
          />
          <Route
            path="/events"
            element={<EventList key={user?.id ?? "public"} locale={locale} />}
          />
          <Route
            path="/events/:eventId"
            element={<EventDetail key={user?.id ?? "public"} locale={locale} />}
          />
          <Route
            path="/organizer/events"
            element={
              <RequireSession locale={locale} roles={["organizer"]}>
                <EventList key={user?.id} locale={locale} organizer />
              </RequireSession>
            }
          />
          <Route
            path="/organizer/events/new"
            element={
              <RequireSession locale={locale} roles={["organizer"]}>
                <EventEditor key={user?.id} locale={locale} />
              </RequireSession>
            }
          />
          <Route
            path="/organizer/events/:eventId/edit"
            element={
              <RequireSession locale={locale} roles={["organizer"]}>
                <EventEditor key={user?.id} locale={locale} />
              </RequireSession>
            }
          />
          <Route
            path="/organizer/events/:eventId/preview"
            element={
              <RequireSession locale={locale} roles={["organizer"]}>
                <EventDetail key={user?.id} locale={locale} preview />
              </RequireSession>
            }
          />
          {authKinds.map((kind) => (
            <Route
              key={kind}
              path={`/${kind}`}
              element={<AuthPage key={kind} kind={kind} locale={locale} />}
            />
          ))}
          <Route
            path="/account"
            element={
              <RequireSession locale={locale}>
                <ProfilePage key={user?.id} locale={locale} />
              </RequireSession>
            }
          />
          <Route
            path="/organizer/profile"
            element={
              <RequireSession locale={locale} roles={["organizer"]}>
                <OrganizerPage key={user?.id} locale={locale} />
              </RequireSession>
            }
          />
          <Route
            path="/organizer/*"
            element={
              <RequireSession locale={locale} roles={["organizer"]}>
                <p>{t.unavailable}</p>
              </RequireSession>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RequireSession locale={locale} roles={["platform_admin"]}>
                <p>{t.unavailable}</p>
              </RequireSession>
            }
          />
          {FoundationPage ? (
            <Route
              path="/dev/foundation"
              element={
                <Suspense fallback={<Status>{t.loading}</Status>}>
                  <FoundationPage locale={locale} />
                </Suspense>
              }
            />
          ) : null}
          <Route
            path="*"
            element={
              <>
                <h1>{t.notFound}</h1>
                <Link to="/">{t.home}</Link>
              </>
            }
          />
        </Routes>
      </main>
    </>
  );
}

function RequireSession({
  locale,
  roles,
  children,
}: {
  locale: Locale;
  roles?: readonly string[];
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const location = useLocation();
  const t = authCopy[locale];
  if (status === "loading") return <Status>{t.loading}</Status>;
  if (!user)
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(safeReturnTo(location.pathname + location.search + location.hash))}`}
        replace
      />
    );
  if (roles && !hasRole(user, roles))
    return (
      <>
        <h1>{t.deniedTitle}</h1>
        <p>{t.forbidden}</p>
        <Link to="/account">{t.account}</Link>
      </>
    );
  return children;
}
