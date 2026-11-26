import { useEffect, useId, useState } from "react";
import { usePopover } from "./popover";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { isLocale, localeLabels, locales, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import {
  ChartIcon,
  ChatIcon,
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
  { menu: string; close: string; hideNotice: string }
> = {
  en: { menu: "Account menu", close: "Close menu", hideNotice: "Hide demo notice" },
  ru: { menu: "Меню аккаунта", close: "Закрыть меню", hideNotice: "Скрыть уведомление о демо" },
  kk: { menu: "Тіркелгі мәзірі", close: "Мәзірді жабу", hideNotice: "Демо хабарламасын жасыру" },
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
    kind: "events" | "admin" | "tickets" | "orders" | "account" | "support";
  }[];
  logoutLabel: string;
  busy: boolean;
  onLogout: () => void;
}) {
  // The menu belongs to the page it was opened on, so navigating closes it.
  const { open, setOpen, root, button, panel } = usePopover();
  const menuId = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  // A drawer owns the screen while open: focus moves in, the page stops scrolling.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open, panel]);
  const icons = {
    events: GridIcon,
    admin: ChartIcon,
    tickets: TicketIcon,
    orders: ReceiptIcon,
    account: UserIcon,
    support: ChatIcon,
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
      {createPortal(
        <div className="account-drawer" hidden={!open}>
          <div className="account-backdrop" aria-hidden="true" onClick={close} />
          <div
            ref={panel}
            className="account-panel"
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label={headerCopy[locale].menu}
          >
            <div className="account-identity">
              <span className="avatar" aria-hidden="true">
                {initials(name, email)}
              </span>
              <div>
                {name ? <strong>{name}</strong> : null}
                <span>{email}</span>
              </div>
              <button
                type="button"
                className="account-close"
                aria-label={headerCopy[locale].close}
                onClick={close}
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <ul>
              {links.map(({ to, label, kind }) => {
                const LinkIcon = icons[kind];
                return (
                  <li key={to}>
                    <NavLink to={to} end onClick={() => setOpen(false)}>
                      <LinkIcon size={20} />
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
              <LogoutIcon size={20} />
              {logoutLabel}
            </button>
          </div>
        </div>,
        document.body,
      )}
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
