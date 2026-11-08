import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { config } from "./config";
import { PageErrorBoundary } from "./PageErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
async function start() {
  if (import.meta.env.DEV && config.useMocks) {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass", quiet: true });
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <PageErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </PageErrorBoundary>
    </StrictMode>,
  );
}
void start().catch(() => {
  document.getElementById("root")!.textContent =
    "BiletFlow: development configuration could not start. Check the environment settings.";
});
