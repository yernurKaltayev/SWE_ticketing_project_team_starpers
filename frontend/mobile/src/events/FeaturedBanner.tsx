import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ApiError, formatEventRange } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { parseEvents } from "@biletflow/shared/features/events/contracts";
import { discoveryCopy } from "@biletflow/shared/features/events/discoveryCopy";
import type { Event } from "@biletflow/shared/features/events/model";
import { api } from "../session";
import { color, fontFiles, radius } from "../theme";
import { webOrigin } from "../public-origin";
import { featuredSlides } from "./discovery-filters";

/** Cover URLs from the API are site-relative; the app needs the full address. */
export function coverUri(event: Event) {
  const cover = event.images[0];
  return cover?.startsWith("/") && webOrigin ? `${webOrigin}${cover}` : cover;
}

/**
 * The big poster banner at the top of the event list, like the web home page: swipe between
 * the upcoming events, it turns on its own every 6 s (not with Reduce Motion, nor after a swipe).
 */
export function FeaturedBanner({ city, locale, onOpen }: {
  city: string;
  locale: Locale;
  onOpen: (event: Event) => void;
}) {
  const d = discoveryCopy[locale];
  const query = new URLSearchParams({ limit: "20", offset: "0" });
  if (city) query.set("city", city);
  const path = `/api/v1/events?${query}`;
  const { data } = useQuery({
    queryKey: ["discovery", "featured", path],
    queryFn: async ({ signal }) => {
      if (!api) throw new ApiError(0, "not_configured", "EXPO_PUBLIC_API_ORIGIN is not set.");
      return parseEvents(await api.request<unknown>(path, { signal }));
    },
  });
  const slides = featuredSlides(data?.items ?? []);
  const count = slides.length;
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const list = useRef<FlatList<Event>>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (count < 2 || held || reduceMotion || !width) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % count;
        list.current?.scrollToOffset({ offset: next * width, animated: true });
        return next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [count, held, reduceMotion, width]);

  if (!count) return null;
  const active = Math.min(index, count - 1);
  return (
    <View
      style={local.frame}
      accessibilityLabel={d.featured}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {width ? (
        <FlatList
          ref={list}
          data={slides}
          keyExtractor={(event) => event.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onScrollBeginDrag={() => setHeld(true)}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => {
            const uri = coverUri(item);
            return (
              <Pressable
                style={[local.slide, { width }]}
                onPress={() => onOpen(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title} · ${i + 1} / ${count}`}
              >
                {uri ? (
                  <Image source={{ uri }} style={local.image} resizeMode="cover" accessibilityIgnoresInvertColors />
                ) : null}
                <View style={[local.caption, !uri && local.captionPlain]}>
                  <Text style={local.title} numberOfLines={2}>{item.title}</Text>
                  <Text style={local.date} numberOfLines={1}>
                    {formatEventRange(item.starts_at, item.ends_at, item.timezone, locale)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      ) : null}
      {count > 1 ? (
        <View style={local.dots} pointerEvents="none">
          {slides.map((event, i) => (
            <View key={event.id} style={[local.dot, i === active && local.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  // Posters are wide; 16:10 shows them nearly uncropped on a phone (the web uses 16/10 on mobile too).
  frame: { width: "100%", aspectRatio: 16 / 10, borderRadius: radius.card, overflow: "hidden", backgroundColor: color.primary },
  slide: { height: "100%", justifyContent: "flex-end" },
  image: StyleSheet.absoluteFill,
  caption: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 26, backgroundColor: "rgba(15, 23, 36, 0.48)", gap: 2 },
  captionPlain: { backgroundColor: "transparent", flex: 1, justifyContent: "flex-end" },
  title: { fontFamily: fontFiles.bold, fontSize: 20, lineHeight: 25, color: "#ffffff" },
  date: { fontFamily: fontFiles.medium, fontSize: 14, lineHeight: 20, color: "rgba(255, 255, 255, 0.88)" },
  dots: { position: "absolute", bottom: 9, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.5)" },
  dotActive: { width: 18, backgroundColor: "#ffffff" },
});
