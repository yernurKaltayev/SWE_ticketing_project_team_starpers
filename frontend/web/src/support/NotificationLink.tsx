import { NavLink } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useLiveQuery } from "./data";
import { parseNotices } from "./model";
import { supportCopy } from "./copy";
import "./support.css";
import { BellIcon } from "../icons";
const unreadPath = "/api/v1/me/notifications?unread_only=true&limit=1&offset=0";
export function NotificationLink({ locale }: { locale: Locale }) {
  const t = supportCopy[locale];
  const count = useLiveQuery(unreadPath, parseNotices, 15000);
  return (
    <NavLink
      className="notification-link"
      to="/account/notifications"
      title={t.notifications}
    >
      <BellIcon size={20} />
      <span className="visually-hidden">{t.notifications}</span>
      {!count.isError && count.data && count.data.total > 0 && (
        <span
          className="support-count"
          aria-label={`${t.unreadCount}: ${count.data.total}`}
        >
          {count.data.total}
        </span>
      )}
    </NavLink>
  );
}
