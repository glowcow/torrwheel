import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import App from "./App";
import { LangProvider } from "./lib/LangProvider";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Everything is polled: the next poll is seconds away, so a retry is
      // pointless, and a page left open on a wall recovers on its own.
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        {/* 400 ms before the first tooltip, 100 ms between neighbours. */}
        <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={100}>
          <App />
        </TooltipPrimitive.Provider>
      </LangProvider>
    </QueryClientProvider>
  </StrictMode>,
);
