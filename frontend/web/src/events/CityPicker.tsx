import { useEffect, useId, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { usePopover } from "../popover";
import { ChevronDownIcon, PinIcon } from "../icons";
import { eventCopy } from "./copy";
import {
  cityChosenByHand,
  locatedThisVisit,
  markCityChosenByHand,
  readCity,
  writeCity,
} from "./city";
import {
  cityLabel,
  defaultCity,
  knownCities,
  nearestCity,
  sameCity,
} from "./venues";

const discoveryPaths = new Set(["/", "/events"]);

/**
 * Header city switch (next to the logo); filters the event listing by city.
 * On each visit the browser is asked for the visitor's location and the nearest city is
 * picked, unless the visitor chose a city by hand. Refused location falls back to Almaty
 * when no city is set yet.
 */
export function CityPicker({ locale }: { locale: Locale }) {
  const { open, setOpen, root, button } = usePopover();
  const menuId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onDiscovery = discoveryPaths.has(location.pathname);
  const current = (onDiscovery ? params.get("city") : readCity()) ?? "";
  // Only the fixed list of Kazakhstan's cities; venue cities outside it never show up here.
  const cities = [...knownCities];
  cities.sort((a, b) => cityLabel(a, locale).localeCompare(cityLabel(b, locale)));
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (cityChosenByHand() || locatedThisVisit()) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const apply = (city: string | undefined, override: boolean) => {
      if (!city || cityChosenByHand() || (!override && readCity())) return;
      writeCity(city);
      if (!discoveryPaths.has(window.location.pathname)) return;
      const next = new URLSearchParams(window.location.search);
      if (next.get("city") && sameCity(next.get("city")!, city)) return;
      next.set("city", city);
      next.delete("offset");
      navigate(`${window.location.pathname}?${next}`, { replace: true });
    };
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        apply(nearestCity(knownCities, pos.coords.latitude, pos.coords.longitude), true),
      () => apply(defaultCity(knownCities), false),
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  }, [navigate]);
  function choose(city: string) {
    setOpen(false);
    button.current?.focus();
    writeCity(city);
    markCityChosenByHand();
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
                aria-pressed={!!current && sameCity(city, current)}
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
