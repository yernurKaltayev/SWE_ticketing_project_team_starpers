import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { isLocale, localeLabels, locales, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import {
  ChevronDownIcon,
  CloseIcon,
  GlobeIcon,
  GridIcon,
  LogoutIcon,
  ReceiptIcon,
  TicketIcon,
  UserIcon,
} from "./icons";

const headerCopy: Record<
  Locale,
  { menu: string; hideNotice: string }
> = {
  en: { menu: "Account menu", hideNotice: "Hide demo notice" },
  ru: { menu: "Меню аккаунта", hideNotice: "Скрыть уведомление о демо" },
  kk: { menu: "Тіркелгі мәзірі", hideNotice: "Демо хабарламасын жасыру" },
};

/** Compact language switch: globe + code, full names in the list. */
export function LanguagePicker({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  return (
    <label className="language-control" title={messages[locale].language}>
      <GlobeIcon size={18} />
      <span className="visually-hidden">{messages[locale].language}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) onChange(event.target.value);
        }}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeLabels[code]}
          </option>
        ))}
      </select>
    </label>
  );
}

function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[1]?.[0] ?? "") : "")
  ).toUpperCase();
}

/**
 * Personal links and sign-out behind one avatar button. Closes on outside
 * click, Escape (returning focus) and navigation.
 */
export function AccountMenu({
  locale,
  name,
  email,
  links,
  logoutLabel,
  busy,
  onLogout,
}: {
  locale: Locale;
  name?: string | null;
  email: string;
  links: {
    to: string;
    label: string;
    kind: "events" | "tickets" | "orders" | "account";
  }[];
  logoutLabel: string;
  busy: boolean;
  onLogout: () => void;
}) {
  const location = useLocation();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? location.pathname : null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const icons = {
    events: GridIcon,
    tickets: TicketIcon,
    orders: ReceiptIcon,
    account: UserIcon,
  };
  return (
    <div className="account-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="account-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={headerCopy[locale].menu}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name, email)}
        </span>
        <ChevronDownIcon size={16} />
      </button>
      <div className="account-panel" id={menuId} hidden={!open}>
        <div className="account-identity">
          {name ? <strong>{name}</strong> : null}
          <span>{email}</span>
        </div>
        <ul>
          {links.map(({ to, label, kind }) => {
            const LinkIcon = icons[kind];
            return (
              <li key={to}>
                <NavLink to={to} end onClick={() => setOpen(false)}>
                  <LinkIcon size={18} />
                  {label}
                </NavLink>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="account-logout"
          disabled={busy}
          onClick={onLogout}
        >
          <LogoutIcon size={18} />
          {logoutLabel}
        </button>
      </div>
    </div>
  );
}

const noticeKey = "biletflow:demo-notice-hidden";
function noticeHidden() {
  try {
    return sessionStorage.getItem(noticeKey) === "1";
  } catch {
    return false;
  }
}

/** Slim demo banner; can be hidden for the rest of the browser session. */
export function DemoNotice({ locale, text }: { locale: Locale; text: string }) {
  const [hidden, setHidden] = useState(noticeHidden);
  if (hidden) return null;
  return (
    <p className="environment-notice">
      <span>{text}</span>
      <button
        type="button"
        className="notice-dismiss"
        aria-label={headerCopy[locale].hideNotice}
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem(noticeKey, "1");
          } catch {
            /* storage unavailable: hide for this page view only */
          }
        }}
      >
        <CloseIcon size={16} />
      </button>
    </p>
  );
}
