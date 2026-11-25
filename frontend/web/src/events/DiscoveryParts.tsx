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
  PinIcon,
  SparkleIcon,
} from "../icons";
import { categoryLabel, knownCategories } from "./categories";
import { parseEvents } from "./contracts";
import { useResource } from "./data";
import { discoveryCopy } from "./discoveryCopy";
import { categoryTone, isoDay } from "./model";
import type { Event, Page } from "./model";
import { cityLabel } from "./venues";
import type { VenueRef } from "./venues";

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

/** Upcoming events as a large rotating banner (pauses on hover/focus). */
export function FeaturedCarousel({
  city,
  venues,
  locale,
}: {
  city: string;
  venues: Map<string, VenueRef>;
  locale: Locale;
}) {
  const d = discoveryCopy[locale];
  const query = new URLSearchParams({ limit: "5", offset: "0" });
  if (city) query.set("city", city);
  const { data } = useResource<Page<Event>>(
    `/api/v1/events?${query}`,
    parseEvents,
  );
  const slides = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const active = count ? index % count : 0;
  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(timer);
  }, [count, paused]);
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
    >
      <div className="featured-track" style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((event, i) => {
          const venue = venues.get(event.venue_id);
          return (
            <article
              key={event.id}
              className="featured-slide"
              data-cover-tone={categoryTone(event.category) || undefined}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              aria-hidden={i !== active}
              style={
                event.images[0]
                  ? { backgroundImage: `url("${encodeURI(event.images[0])}")` }
                  : undefined
              }
            >
              <div className="featured-body">
                {event.category && (
                  <span className="featured-category">
                    {categoryLabel(event.category, locale)}
                  </span>
                )}
                <h2>
                  <Link to={`/events/${event.id}`} tabIndex={i === active ? 0 : -1}>
                    {event.title}
                  </Link>
                </h2>
                <p className="featured-meta">
                  <CalendarIcon size={16} />
                  {formatEventRange(event.starts_at, event.ends_at, event.timezone, locale)}
                </p>
                {venue && (
                  <p className="featured-meta">
                    <PinIcon size={16} />
                    {venue.name}
                    {venue.city ? ` · ${cityLabel(venue.city, locale)}` : ""}
                  </p>
                )}
                <Link
                  className="action-link"
                  to={`/events/${event.id}`}
                  tabIndex={i === active ? 0 : -1}
                >
                  {d.details}
                  <ArrowRightIcon size={16} />
                </Link>
              </div>
            </article>
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
