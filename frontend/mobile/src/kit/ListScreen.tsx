import type { ReactElement, ReactNode } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import type { ListRenderItem } from "react-native";
import type { Locale } from "@biletflow/shared";
import { color } from "../theme";
import { Muted, styles as ui } from "../ui";
import { kitCopy } from "./copy";
import { ErrorState } from "./States";

/**
 * A server list: header, loading text while `data` is undefined, error with retry, empty
 * state, pull-to-refresh and an optional "load more" footer.
 */
export function ListScreen<T>({
  data,
  renderItem,
  keyExtractor,
  header,
  empty,
  error,
  onRetry,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore = false,
  locale,
}: {
  data: T[] | undefined;
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T) => string;
  header?: ReactNode;
  empty: ReactElement;
  error?: string | null;
  onRetry: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  return (
    <FlatList
      data={data ?? []}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      style={ui.fill}
      contentContainerStyle={ui.content}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={color.primary}
          colors={[color.primary]}
        />
      }
      ListHeaderComponent={
        <View style={ui.stack}>
          {header}
          {error ? <ErrorState code={error} onRetry={onRetry} locale={locale} /> : null}
          {data === undefined && !error ? <Muted live="polite">{t.loading}</Muted> : null}
        </View>
      }
      ListEmptyComponent={data !== undefined && !error ? empty : undefined}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 12, alignItems: "center", gap: 6 }}>
            <ActivityIndicator color={color.primary} />
            <Muted>{t.loadingMore}</Muted>
          </View>
        ) : undefined
      }
    />
  );
}
