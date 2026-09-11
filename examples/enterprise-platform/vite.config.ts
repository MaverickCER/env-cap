import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

// TanStack Start apps are configured as a Vite plugin, not a separate
// app.config.ts -- routes are file-based under src/routes/, and
// createServerFn() (src/server/functions/*) compiles to real server-only
// code, never bundled into the client.
export default defineConfig({
  plugins: [tanstackStart()],
});
