import { useId, useState } from "react";
import { usePopover } from "./popover";
import { NavLink } from "react-router-dom";
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

const localeCodes: Record<Locale, string> = { en: "EN", ru: "RU", kk: "KZ" };

/** Language switch: globe + short code; a menu lists the full names. */
export function LanguagePicker({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  const { open, setOpen, root, button } = usePopover();
  const menuId = useId();
  return (
    <div className="language-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="language-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${messages[locale].language}: ${localeLabels[locale]}`}
        onClick={() => setOpen(!open)}
      >
        <GlobeIcon size={18} />
        <span aria-hidden="true">{localeCodes[locale]}</span>
        <ChevronDownIcon size={14} />
      </button>
      <div className="language-panel" id={menuId} hidden={!open}>
        <ul aria-label={messages[locale].language}>
          {locales.map((code) => (
            <li key={code}>
              <button
                type="button"
                lang={code}
                aria-pressed={code === locale}
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                  if (isLocale(code) && code !== locale) onChange(code);
                }}
              >
                <span>{localeLabels[code]}</span>
                <span className="language-code">{localeCodes[code]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
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
  // The menu belongs to the page it was opened on, so navigating closes it.
  const { open, setOpen, root, button } = usePopover();
  const menuId = useId();
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
