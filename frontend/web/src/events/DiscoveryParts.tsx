import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import { formatEventRange, intlLocales } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BallIcon,
  BalloonIcon,
  BookIcon,
  CalendarIcon,
  ChatIcon,
  DotsIcon,
  FrameIcon,
  GridIcon,
  MaskIcon,
  MicIcon,
  MusicIcon,
  SparkleIcon,
} from "../icons";
import { categoryLabel, knownCategories } from "./categories";
import { parseEvents } from "./contracts";
import { useResource } from "./data";
import { discoveryCopy } from "./discoveryCopy";
import { categoryTone, isoDay } from "./model";
import type { Event, Page } from "./model";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
const categoryIcons: Record<string, IconType> = {
  concert: MusicIcon,
  festival: SparkleIcon,
  theatre: MaskIcon,
  sport: BallIcon,
  conference: MicIcon,
  meetup: ChatIcon,
  education: BookIcon,
  exhibition: FrameIcon,
  kids: BalloonIcon,
  other: DotsIcon,
};

/** Category pills with icons; "All" clears the filter. */
export function CategoryBar({
  value,
  locale,
  onChange,
}: {
  value: string;
  locale: Locale;
  onChange: (category: string) => void;
}) {
  const d = discoveryCopy[locale];
  const current = value.trim().toLowerCase();
  return (
    <nav className="category-bar" aria-label={d.categories}>
      {["", ...knownCategories].map((key) => {
        const Icon = key ? categoryIcons[key] : GridIcon;
        return (
          <button
            key={key || "all"}
            type="button"
            className="category-pill"
            aria-pressed={current === key}
            onClick={() => onChange(key)}
          >
            {Icon && <Icon size={18} />}
            {key ? categoryLabel(key, locale) : d.all}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Upcoming events as a picture banner: the event's own image (or a generated
 * cover with its title when there is none) is the whole slide and opens the event.
 * Arrows appear on mouse hover; phones swipe.
 */
export function FeaturedCarousel({
  city,
  locale,
}: {
  city: string;
  locale: Locale;
}) {
  const d = discoveryCopy[locale];
  const query = new URLSearchParams({ limit: "20", offset: "0" });
  if (city) query.set("city", city);
  const { data } = useResource<Page<Event>>(
    `/api/v1/events?${query}`,
    parseEvents,
  );
  // Soonest events with a cover photo first; generated covers only fill the gaps.
  const upcoming = data?.items ?? [];
  const slides = [
    ...upcoming.filter((e) => e.images.length > 0),
    ...upcoming.filter((e) => e.images.length === 0),
  ].slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null);
  const moved = useRef(false);
  const count = slides.length;
  const active = count ? index % count : 0;
  useEffect(() => {
    if (count < 2 || paused || drag) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(timer);
  }, [count, paused, drag]);
  if (!count) return null;
  const go = (next: number) => setIndex((next + count) % count);
  return (
    <section
      className="featured"
      aria-roledescription="carousel"
      aria-label={d.featured}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        moved.current = false;
        setDrag({ x: e.touches[0].clientX, dx: 0 });
      }}
      onTouchMove={(e) => {
        if (!drag) return;
        const dx = e.touches[0].clientX - drag.x;
        if (Math.abs(dx) > 8) moved.current = true;
        setDrag({ ...drag, dx });
      }}
      onTouchEnd={() => {
        if (drag && Math.abs(drag.dx) > 50) go(active + (drag.dx < 0 ? 1 : -1));
        setDrag(null);
      }}
    >
      <div
        className={`featured-track${drag ? " is-dragging" : ""}`}
        style={{
          transform: `translateX(calc(${-active * 100}% + ${drag?.dx ?? 0}px))`,
        }}
      >
        {slides.map((event, i) => {
          const image = event.images[0];
          return (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className={`featured-slide${image ? " has-image" : ""}`}
              data-cover-tone={categoryTone(event.category) || undefined}
              aria-roledescription="slide"
              aria-label={`${event.title} · ${i + 1} / ${count}`}
              aria-hidden={i !== active}
              tabIndex={i === active ? 0 : -1}
              draggable={false}
              onClick={(e) => {
                // A swipe that ends on the slide is not a click.
                if (moved.current) e.preventDefault();
              }}
              style={image ? { backgroundImage: `url("${encodeURI(image)}")` } : undefined}
            >
              {!image && (
                <span className="featured-art" aria-hidden="true">
                  <strong>{event.title}</strong>
                  <span>
                    {formatEventRange(event.starts_at, event.ends_at, event.timezone, locale)}
                  </span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            className="featured-arrow is-prev"
            aria-label={d.previous}
            onClick={() => go(active - 1)}
          >
            <ArrowLeftIcon size={20} />
          </button>
          <button
            type="button"
            className="featured-arrow is-next"
            aria-label={d.next}
            onClick={() => go(active + 1)}
          >
            <ArrowRightIcon size={20} />
          </button>
          <div className="featured-dots">
            {slides.map((event, i) => (
              <button
                key={event.id}
                type="button"
                aria-label={`${i + 1} / ${count}`}
                aria-current={i === active}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const kkMonths = [
  "Қаңтар",
  "Ақпан",
  "Наурыз",
  "Сәуір",
  "Мамыр",
  "Маусым",
  "Шілде",
  "Тамыз",
  "Қыркүйек",
  "Қазан",
  "Қараша",
  "Желтоқсан",
];
const kkWeekdays = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];
const DAYS = 30;

function dayNames(day: Date, locale: Locale) {
  if (locale === "kk")
    return { month: kkMonths[day.getMonth()], weekday: kkWeekdays[day.getDay()] };
  const month = new Intl.DateTimeFormat(intlLocales[locale], { month: "long" }).format(day);
  const weekday = new Intl.DateTimeFormat(intlLocales[locale], { weekday: "short" }).format(day);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { month: cap(month), weekday: cap(weekday.replace(".", "")) };
}

/** "All dates" plus the next 30 days as a scrollable strip, month names above. */
export function DateStrip({
  from,
  to,
  locale,
  onChange,
}: {
  from: string;
  to: string;
  locale: Locale;
  onChange: (day: string | null) => void;
}) {
  const d = discoveryCopy[locale];
  const scroller = useRef<HTMLDivElement>(null);
  const [today] = useState(() => new Date());
  const days = Array.from({ length: DAYS }, (_, i) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return { day, iso: isoDay(day), ...dayNames(day, locale) };
  });
  const scroll = (direction: number) =>
    scroller.current?.scrollBy({
      left: direction * scroller.current.clientWidth * 0.8,
      behavior: "smooth",
    });
  return (
    <div className="date-strip" role="group" aria-label={d.dates}>
      <button
        type="button"
        className="date-all"
        aria-pressed={!from && !to}
        onClick={() => onChange(null)}
      >
        <CalendarIcon size={18} />
        <span className="date-all-label">{d.allDates}</span>
      </button>
      <button
        type="button"
        className="date-scroll is-prev"
        aria-label={d.previous}
        onClick={() => scroll(-1)}
      >
        <ArrowLeftIcon size={16} />
      </button>
      <div className="date-days" ref={scroller}>
        {days.map(({ day, iso, month, weekday }, i) => {
          const showMonth = i === 0 || day.getDate() === 1;
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <div className="date-col" key={iso}>
              <span className="date-month" aria-hidden={!showMonth}>
                {showMonth ? month : " "}
              </span>
              <button
                type="button"
                className={`date-day${weekend ? " is-weekend" : ""}`}
                aria-pressed={from === iso && to === iso}
                aria-label={`${weekday} ${day.getDate()} ${month}`}
                onClick={() => onChange(iso)}
              >
                <span>{weekday}</span>
                <strong>{day.getDate()}</strong>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="date-scroll is-next"
        aria-label={d.next}
        onClick={() => scroll(1)}
      >
        <ArrowRightIcon size={16} />
      </button>
    </div>
  );
}
