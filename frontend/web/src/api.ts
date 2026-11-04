import { createApiClient, createMemoryTokenStore } from "@biletflow/shared";
import { config } from "./config";

export const tokenStore = createMemoryTokenStore();
export const api = createApiClient({
  baseUrl: config.apiOrigin,
  getAccessToken: tokenStore.getAccessToken,
});
