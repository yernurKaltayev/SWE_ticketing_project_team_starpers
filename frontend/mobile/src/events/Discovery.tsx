import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError, formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { categoryLabel } from "@biletflow/shared/features/events/categories";
import { parseEvents } from "@biletflow/shared/features/events/contracts";
import { eventCopy } from "@biletflow/shared/features/events/copy";
import { discoveryCopy } from "@biletflow/shared/features/events/discoveryCopy";
import { searchQuery } from "@biletflow/shared/features/events/model";
import type { Event } from "@biletflow/shared/features/events/model";
import { cityLabel, knownCities, parseVenueRefs } from "@biletflow/shared/features/events/venues";
import { EmptyState } from "../kit/States";
import { ListScreen } from "../kit/ListScreen";
import { api } from "../session";
import { color, radius } from "../theme";
import { Action, Card, Heading, Input, Muted, Pill, Title } from "../ui";
import { discoveryFilters, withSheetValues } from "./discovery-filters";
import type { DiscoveryParams } from "./discovery-filters";
import { DiscoveryFilterSheet } from "./DiscoveryFilterSheet";
import { coverUri, FeaturedBanner } from "./FeaturedBanner";

const venuePath = "/api/v1/venues";
const pageSize = 12;
const errorCode = (error: unknown) => error instanceof ApiError ? error.code : error ? "unexpected" : null;

async function get(path: string, signal: AbortSignal) {
  if (!api) throw new ApiError(0, "not_configured", "EXPO_PUBLIC_API_ORIGIN is not set.");
  return api.request<unknown>(path, { signal });
}

export function Discovery({ locale, initial, onOpen }: {
  locale: Locale;
  initial?: DiscoveryParams;
  onOpen: (event: Event) => void;
}) {
  const t = eventCopy[locale];
  const d = discoveryCopy[locale];
  const [filters, setFilters] = useState(() => discoveryFilters(initial));
  const [search, setSearch] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchParams = searchQuery(new URLSearchParams(filters));
  const events = useInfiniteQuery({
    queryKey: ["discovery", searchParams],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams(searchParams);
      params.set("offset", String(pageParam));
      return parseEvents(await get(`/api/v1/events?${params}`, signal));
    },
    getNextPageParam: (page, _pages, offset) => {
      const next = offset + pageSize;
      return page.items.length > 0 && next < page.total ? next : undefined;
    },
  });
  const venues = useQuery({
    queryKey: ["discovery", venuePath],
    queryFn: async ({ signal }) => parseVenueRefs(await get(venuePath, signal)),
  });
  const venueById = useMemo(() => new Map(venues.data?.map((venue) => [venue.id, venue])), [venues.data]);
  const cities = useMemo(
    () => [...knownCities].sort((a, b) => cityLabel(a, locale).localeCompare(cityLabel(b, locale), locale)),
    [locale],
  );
  const items = useMemo(() => {
    if (!events.data) return undefined;
    return [...new Map(events.data.pages.flatMap(({ items: page }) => page.map((event) => [event.id, event]))).values()];
  }, [events.data]);

  function submitSearch() {
    setFilters((current) => ({ ...current, q: search.trim() }));
  }

  async function refresh() {
    setRefreshing(true);
    await Promise.all([events.refetch(), venues.refetch()]);
    setRefreshing(false);
  }

  return (
    <>
      <ListScreen
        locale={locale}
        data={items}
        error={errorCode(events.error)}
        onRetry={() => void (events.isFetchNextPageError ? events.fetchNextPage() : events.refetch())}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (events.hasNextPage && !events.isFetching && !events.isFetchNextPageError) void events.fetchNextPage();
        }}
        loadingMore={events.isFetchingNextPage}
        keyExtractor={(event) => event.id}
        header={
          <>
            <Title>{t.events}</Title>
            <FeaturedBanner city={filters.city} locale={locale} onOpen={onOpen} />
            <Input value={search} onChangeText={setSearch} accessibilityLabel={t.search}
              placeholder={d.searchPlaceholder} maxLength={200} returnKeyType="search" onSubmitEditing={submitSearch} />
            <Action title={d.searchSubmit} variant="primary" onPress={submitSearch} />
            <Action title={d.filters} onPress={() => setShowFilters(true)} />
            {Object.values(filters).some(Boolean) ? (
              <Action title={t.reset} onPress={() => {
                setSearch("");
                setFilters(discoveryFilters());
              }} />
            ) : null}
            {events.data ? <Muted live="polite">{t.results} {events.data.pages[0]?.total ?? 0}</Muted> : null}
          </>
        }
        empty={<EmptyState title={d.emptyTitle} body={d.emptyHint} />}
        renderItem={({ item }) => {
          const venue = venueById.get(item.venue_id);
          const uri = coverUri(item);
          return (
            <Card style={local.card}>
              {uri ? <Image source={{ uri }} style={local.cover} accessibilityIgnoresInvertColors /> : null}
              {item.category ? <Pill label={categoryLabel(item.category, locale)} tone="primary" /> : null}
              <Heading>{item.title}</Heading>
              <Muted>{formatEventDateTime(item.starts_at, item.timezone, locale)}</Muted>
              {venue ? <Muted>{[venue.name, cityLabel(venue.city, locale)].filter(Boolean).join(" · ")}</Muted> : null}
              <View style={local.link}>
                <Action title={d.details} accessibilityHint={item.title} onPress={() => onOpen(item)} />
              </View>
            </Card>
          );
        }}
      />
      {showFilters ? (
        <DiscoveryFilterSheet filters={filters} cities={cities} locale={locale}
          onClose={() => setShowFilters(false)}
          onApply={(values) => {
            setFilters((current) => withSheetValues(current, values));
            setShowFilters(false);
          }} />
      ) : null}
    </>
  );
}

const local = StyleSheet.create({
  card: { gap: 8 },
  cover: { width: "100%", height: 156, borderRadius: radius.control, backgroundColor: color.canvas },
  link: { marginTop: 4 },
});
