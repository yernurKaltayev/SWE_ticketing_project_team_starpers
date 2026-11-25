import type { ReactNode, SVGProps } from "react";

/** One stroke family (1.75px, round joins) so every glyph reads as a set. */
function Icon({
  children,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };

export const CalendarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);
export const ClockIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const PinIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </Icon>
);
export const TicketIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 8.5V6.5a1.5 1.5 0 0 1 1.5-1.5h14a1.5 1.5 0 0 1 1.5 1.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-2a2.5 2.5 0 0 0 0-5Z" />
    <path d="M14.5 5v2M14.5 10.5v3M14.5 17v2" />
  </Icon>
);
export const ReceiptIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.2-1.5 1.2-2-1.5L6 20.5Z" />
    <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
  </Icon>
);
export const GridIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const UserIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.5 20c1.2-3.6 4-5.25 7.5-5.25s6.3 1.65 7.5 5.25" />
  </Icon>
);
export const UsersIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="3.25" />
    <path d="M3.5 19.5c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5" />
    <path d="M15.5 6.2a3.25 3.25 0 0 1 0 5.6M17.5 15.4c1.4.6 2.4 1.9 3 4.1" />
  </Icon>
);
export const WalletIcon = (p: P) => (
  <Icon {...p}>
    <path d="M19 8V6.5A1.5 1.5 0 0 0 17.5 5h-12A2 2 0 0 0 3.5 7v10.5a2 2 0 0 0 2 2h13a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 18.5 8H5.5" />
    <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
  </Icon>
);
export const BankIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 9 12 4.5 20.5 9M5 9.5v8M9.5 9.5v8M14.5 9.5v8M19 9.5v8M3.5 20h17" />
  </Icon>
);
export const ChartIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </Icon>
);
export const EditIcon = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 5.5 18.5 9.5M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19Z" />
  </Icon>
);
export const EyeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </Icon>
);
export const SeatIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6.5 11V6.5A2.5 2.5 0 0 1 9 4h6a2.5 2.5 0 0 1 2.5 2.5V11" />
    <path d="M4.5 11h15v4.5h-15ZM6.5 15.5V20M17.5 15.5V20" />
  </Icon>
);
export const BoltIcon = (p: P) => (
  <Icon {...p}>
    <path d="M13 3 5 13.5h6.5L10.5 21 19 10.5h-6.5Z" />
  </Icon>
);
export const ArrowLeftIcon = (p: P) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </Icon>
);
export const LogoutIcon = (p: P) => (
  <Icon {...p}>
    <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16l4-4-4-4M14 12H4.5" />
  </Icon>
);

export const BellIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
);
export const GlobeIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5Z" />
  </Icon>
);
export const ChevronDownIcon = (p: P) => (
  <Icon {...p}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </Icon>
);
export const AlertIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Icon>
);

export const MusicIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 18V5.5l10-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Icon>
);
export const SparkleIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z" />
    <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
  </Icon>
);
export const MaskIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 5h15v6.5a7.5 7.5 0 0 1-15 0Z" />
    <path d="M8.5 9.5h1.5M14 9.5h1.5M9 14a4 4 0 0 0 6 0" />
  </Icon>
);
export const BallIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5l3.8 2.8-1.5 4.5H9.7l-1.5-4.5Z" />
    <path d="M12 3.5v4M15.8 10.3l4.2-1.6M14.3 14.8l2.6 3.7M9.7 14.8l-2.6 3.7M8.2 10.3 4 8.7" />
  </Icon>
);
export const MicIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
  </Icon>
);
export const ChatIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5h0a2 2 0 0 1-1.5-2Z" />
  </Icon>
);
export const BookIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 6.5c-2-1.6-4.7-2-7.5-1.5v13c2.8-.5 5.5-.1 7.5 1.5 2-1.6 4.7-2 7.5-1.5V5c-2.8-.5-5.5-.1-7.5 1.5ZM12 6.5v13" />
  </Icon>
);
export const FrameIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4.5" width="16" height="15" rx="2" />
    <path d="m4 16 4.5-4.5 4 4 2.5-2.5 5 5" />
    <circle cx="15" cy="9" r="1.5" />
  </Icon>
);
export const BalloonIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 15.5c-3.3 0-6-3-6-6.5a6 6 0 0 1 12 0c0 3.5-2.7 6.5-6 6.5Z" />
    <path d="m11 15.5-.5 1.5h3l-.5-1.5M12 17c0 2-1.5 2.5-1.5 4" />
  </Icon>
);
export const DotsIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="18" cy="12" r="1.3" />
  </Icon>
);

/** BiletFlow mark: lowercase "b" in a rounded tile (Figma shared component). */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#455ce9" />
      <path
        d="M11.5 7.5v16"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle
        cx="16.6"
        cy="18.4"
        r="5.1"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
      />
    </svg>
  );
}
