import { EmailOrderLink, EmailTicketsLink } from "./support/EmailLinks";
import { NotificationLink } from "./support/NotificationLink";
import { supportCopy } from "./support/copy";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
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
import { paymentCopy } from "./payments/copy";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { operationsCopy } from "./operations/copy";
import { staffCopy } from "./staff/copy";
import { seatingCopy } from "./seating/copy";
import {
  BankIcon,
  BoltIcon,
  BrandMark,
  ChartIcon,
  EditIcon,
  EyeIcon,
  GridIcon,
  PlusIcon,
  ReceiptIcon,
  SeatIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from "./icons";

const SupportCases = lazy(() => import("./support/Cases"));
const NewSupportCase = lazy(() => import("./support/NewCase"));
const SupportThread = lazy(() => import("./support/Thread"));
const Notifications = lazy(() => import("./support/Notifications"));

const Campaigns = lazy(() => import("./promotions/Campaigns"));

const Operations = lazy(() => import("./operations/Workspace"));

const SeatPage = lazy(() =>
  import("./seating/Pages").then((m) => ({ default: m.SeatPage })),
);
const SeatingSetup = lazy(() =>
  import("./seating/Pages").then((m) => ({ default: m.SeatingSetup })),
);

const Activation = lazy(() => import("./payments/Organizer"));
const Accounts = lazy(() =>
  import("./payments/Organizer").then((m) => ({ default: m.AccountsPage })),
);
const Financials = lazy(() =>
  import("./payments/Organizer").then((m) => ({ default: m.FinancialsPage })),
);
const Payouts = lazy(() =>
  import("./payments/Organizer").then((m) => ({ default: m.PayoutsPage })),
);

const Staff = lazy(() => import("./staff/StaffPage"));

const Checkout = lazy(() => import("./checkout/CheckoutPage"));
const Orders = lazy(() => import("./checkout/Orders"));
const OrderDetail = lazy(() =>
  import("./checkout/Orders").then((m) => ({ default: m.OrderDetail })),
);
const Tickets = lazy(() => import("./checkout/Tickets"));
const TicketDetail = lazy(() =>
  import("./checkout/Tickets").then((m) => ({ default: m.TicketDetail })),
);

const SeatingDemo =
  import.meta.env.DEV && config.useMocks
    ? lazy(() => import("./seating/Demo"))
    : null;

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
  const isOrganizer = hasRole(user, ["organizer"]);
  const showWorkspace =
    isOrganizer && location.pathname.startsWith("/organizer/");
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
          <BrandMark />
          BiletFlow
        </Link>
        <nav className="site-nav" aria-label="BiletFlow">
          <NavLink to="/events">{eventCopy[locale].events}</NavLink>
          {user ? (
            <>
              <NotificationLink locale={locale} />
              <NavLink to="/support">{supportCopy[locale].title}</NavLink>
              <NavLink to="/account/tickets">
                {commerceNavigation[locale].tickets}
              </NavLink>
              <NavLink to="/account/orders">
                {commerceNavigation[locale].orders}
              </NavLink>
            </>
          ) : null}
          {isOrganizer && (
            <NavLink to="/organizer/events">
              {eventCopy[locale].organizer}
            </NavLink>
          )}
        </nav>
        <div className="account-nav">
          <label className="language-control">
            <span>{messages[locale].language}</span>
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
          {user ? (
            <>
              <NavLink to="/account" end className="account-secondary">
                {t.account}
              </NavLink>
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
              <NavLink
                to={`/login?returnTo=${encodeURIComponent(safeReturnTo(location.pathname + location.search))}`}
              >
                {t.login}
              </NavLink>
              <Link className="action-link" to="/register">
                {t.register}
              </Link>
            </>
          )}
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        {config.useMocks ? (
          <p className="environment-notice">{t.mockNotice}</p>
        ) : null}
        {logoutError ? <Status>{t.logoutFailed}</Status> : null}
        <div className={showWorkspace ? "workspace" : undefined}>
          {showWorkspace ? (
            <OrganizerNav locale={locale} pathname={location.pathname} />
          ) : null}
          <div className={showWorkspace ? "workspace-main" : undefined}>
        <PageErrorBoundary
          key={`${location.key}:${user?.id ?? "public"}`}
          locale={locale}
          navigation={
            <>
              <Link to="/events">{eventCopy[locale].back}</Link>
              <Link to="/account/orders">
                {commerceNavigation[locale].orders}
              </Link>
            </>
          }
        >
          <Routes>
            <Route path="/orders/:orderId" element={<EmailOrderLink />} />
            <Route path="/tickets" element={<EmailTicketsLink />} />
            {[
              { path: "/account/notifications", Page: Notifications },
              { path: "/support", Page: SupportCases },
              { path: "/support/new", Page: NewSupportCase },
              { path: "/support/cases/:caseId", Page: SupportThread },
            ].map(({ path, Page }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireSession locale={locale}>
                    <Suspense fallback={<Status>{t.loading}</Status>}>
                      <Page key={user?.id} locale={locale} />
                    </Suspense>
                  </RequireSession>
                }
              />
            ))}
            <Route
              path="/organizer/events/:eventId/promotions"
              element={
                <RequireSession locale={locale} roles={["organizer"]}>
                  <Suspense fallback={<Status>{t.loading}</Status>}>
                    <Campaigns key={user?.id} locale={locale} />
                  </Suspense>
                </RequireSession>
              }
            />
            {[
              "/organizer/events/:eventId/orders",
              "/organizer/events/:eventId/orders/:orderId",
            ].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireSession locale={locale} roles={["organizer"]}>
                    <Suspense fallback={<Status>{t.loading}</Status>}>
                      <Operations key={user?.id} locale={locale} />
                    </Suspense>
                  </RequireSession>
                }
              />
            ))}
            {SeatingDemo && (
              <Route
                path="/dev/seating"
                element={
                  <RequireSession locale={locale}>
                    <Suspense fallback={<Status>{t.loading}</Status>}>
                      <SeatingDemo key={user?.id} locale={locale} />
                    </Suspense>
                  </RequireSession>
                }
              />
            )}
            <Route
              path="/events/:eventId/seats"
              element={
                <Suspense fallback={<Status>{t.loading}</Status>}>
                  <SeatPage key={user?.id ?? "public"} locale={locale} />
                </Suspense>
              }
            />
            <Route
              path="/organizer/events/:eventId/seating"
              element={
                <RequireSession locale={locale} roles={["organizer"]}>
                  <Suspense fallback={<Status>{t.loading}</Status>}>
                    <SeatingSetup key={user?.id} locale={locale} />
                  </Suspense>
                </RequireSession>
              }
            />
            {[
              {
                path: "/organizer/events/:eventId/activation",
                Component: Activation,
              },
              {
                path: "/organizer/events/:eventId/financials",
                Component: Financials,
              },
              { path: "/organizer/events/:eventId/staff", Component: Staff },
              { path: "/organizer/payout-accounts", Component: Accounts },
              { path: "/organizer/payouts", Component: Payouts },
            ].map(({ path, Component }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireSession locale={locale} roles={["organizer"]}>
                    <Suspense fallback={<Status>{t.loading}</Status>}>
                      <Component key={user?.id} locale={locale} />
                    </Suspense>
                  </RequireSession>
                }
              />
            ))}
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
              element={
                <EventDetail key={user?.id ?? "public"} locale={locale} />
              }
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
        </PageErrorBoundary>
          </div>
        </div>
      </main>
    </>
  );
}

function OrganizerNav({
  locale,
  pathname,
}: {
  locale: Locale;
  pathname: string;
}) {
  const ev = eventCopy[locale];
  const pay = paymentCopy[locale];
  const eventId = /^\/organizer\/events\/([^/]+)\/.+/.exec(pathname)?.[1];
  const scoped = eventId && eventId !== "new" ? eventId : null;
  const base = scoped ? `/organizer/events/${scoped}` : "";
  const general = [
    {
      to: "/organizer/events",
      label: ev.organizer,
      icon: <GridIcon />,
      end: true,
    },
    { to: "/organizer/events/new", label: ev.create, icon: <PlusIcon /> },
    { to: "/organizer/payouts", label: pay.finances, icon: <WalletIcon /> },
    {
      to: "/organizer/payout-accounts",
      label: pay.accounts,
      icon: <BankIcon />,
    },
    {
      to: "/organizer/profile",
      label: authCopy[locale].organizer,
      icon: <UserIcon />,
    },
  ];
  const eventLinks = scoped
    ? [
        { to: `${base}/edit`, label: ev.edit, icon: <EditIcon /> },
        { to: `${base}/preview`, label: ev.preview, icon: <EyeIcon /> },
        {
          to: `${base}/orders`,
          label: operationsCopy[locale].title,
          icon: <ReceiptIcon />,
        },
        { to: `${base}/activation`, label: pay.activation, icon: <BoltIcon /> },
        { to: `${base}/financials`, label: pay.finances, icon: <ChartIcon /> },
        {
          to: `${base}/staff`,
          label: staffCopy[locale].link,
          icon: <UsersIcon />,
        },
        {
          to: `${base}/seating`,
          label: seatingCopy[locale].setup,
          icon: <SeatIcon />,
        },
      ]
    : [];
  const groups = [
    { id: "nav-organizer", label: authCopy[locale].organizerRole, links: general },
    ...(eventLinks.length
      ? [{ id: "nav-event", label: ev.details, links: eventLinks }]
      : []),
  ];
  return (
    <nav className="workspace-nav" aria-label={authCopy[locale].organizerRole}>
      {groups.map((group) => (
        <section key={group.id}>
          <p className="nav-label" id={group.id}>
            {group.label}
          </p>
          <ul aria-labelledby={group.id}>
            {group.links.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={"end" in link && link.end === true}>
                  {link.icon}
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
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
