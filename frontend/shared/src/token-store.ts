export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  get(): Promise<TokenPair | null>;
  set(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

/** Per-instance, non-persistent session storage. Reloading clears these credentials. */
export function createMemoryTokenStore(): TokenStore {
  let current: TokenPair | null = null;
  return {
    async get() {
      return current ? { ...current } : null;
    },
    async set(tokens) {
      if (!tokens.accessToken || !tokens.refreshToken) {
        throw new TypeError("Both access and refresh tokens must be nonempty.");
      }
      current = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    },
    async clear() {
      current = null;
    },
    async getAccessToken() {
      return current?.accessToken ?? null;
    },
  };
}
