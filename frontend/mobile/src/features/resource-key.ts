const parserIds = new WeakMap<object, number>();
let nextParserId = 1;

/**
 * Cache key for a screen resource. It includes the parser, because two screens can read the
 * same URL into different shapes (the event page and checkout both read /availability); a
 * shared entry would hand one screen the other's data.
 */
export function resourceKey(
  userId: string | null | undefined,
  path: string,
  parse: (raw: unknown) => unknown,
): readonly unknown[] {
  let id = parserIds.get(parse);
  if (id === undefined) {
    id = nextParserId++;
    parserIds.set(parse, id);
  }
  return ["mobile", userId, path, id];
}
