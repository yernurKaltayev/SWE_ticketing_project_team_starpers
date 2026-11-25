import { useEffect, useId, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { usePopover } from "../popover";
import { ChevronDownIcon, PinIcon } from "../icons";
import { useResource } from "./data";
import { eventCopy } from "./copy";
import { readCity, writeCity } from "./city";
import { cityLabel, defaultCity, nearestCity, parseVenueRefs } from "./venues";
import type { VenueRef } from "./venues";

const discoveryPaths = new Set(["/", "/events"]);

/**
 * Header city switch (next to the logo); filters the event listing by city.
 * With no city chosen yet, the browser is asked for the visitor's location once
 * and the nearest city is picked (Almaty when location is refused).
 */
export function CityPicker({ locale }: { locale: Locale }) {
  const { open, setOpen, root, button } = usePopover();
  const menuId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const venues = useResource<VenueRef[]>("/api/v1/venues", parseVenueRefs);
  const onDiscovery = discoveryPaths.has(location.pathname);
  const current = (onDiscovery ? params.get("city") : readCity()) ?? "";
  // One entry per case-insensitive city, labelled in the UI language.
  const cities = [
    ...new Map(
      [...(venues.data ?? []).map((v) => v.city), current]
        .filter(Boolean)
        .map((c) => [c.toLowerCase(), c] as const),
    ).values(),
  ].sort((a, b) => cityLabel(a, locale).localeCompare(cityLabel(b, locale)));
  const asked = useRef(false);
  const ready = venues.data !== undefined;
  useEffect(() => {
    if (current || !ready || !cities.length || asked.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    asked.current = true;
    const apply = (city: string | undefined) => {
      if (!city || readCity()) return;
      writeCity(city);
      if (!onDiscovery) return;
      const next = new URLSearchParams(window.location.search);
      if (next.get("city")) return;
      next.set("city", city);
      navigate(`${location.pathname}?${next}`, { replace: true });
    };
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        apply(nearestCity(cities, pos.coords.latitude, pos.coords.longitude) ?? defaultCity(cities)),
      () => apply(defaultCity(cities)),
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  });
  function choose(city: string) {
    setOpen(false);
    button.current?.focus();
    writeCity(city);
    const next = onDiscovery ? new URLSearchParams(params) : new URLSearchParams();
    next.delete("offset");
    if (city) next.set("city", city);
    else next.delete("city");
    const query = next.toString();
    navigate(`${onDiscovery ? location.pathname : "/"}${query ? `?${query}` : ""}`);
  }
  return (
    <div className="language-menu city-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="city-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${eventCopy[locale].city}: ${current ? cityLabel(current, locale) : ""}`}
        onClick={() => setOpen(!open)}
      >
        <PinIcon size={16} />
        <span>{current ? cityLabel(current, locale) : eventCopy[locale].city}</span>
        <ChevronDownIcon size={14} />
      </button>
      <div className="language-panel city-panel" id={menuId} hidden={!open}>
        <ul aria-label={eventCopy[locale].city}>
          {cities.map((city) => (
            <li key={city}>
              <button
                type="button"
                aria-pressed={city.toLowerCase() === current.toLowerCase()}
                onClick={() => choose(city)}
              >
                <span>{cityLabel(city, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
