import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "./vitest.shared.config.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  ...sharedVitestConfig,
  resolve: {
    alias: [
      ...sharedVitestConfig.resolve.alias,
      { find: "@", replacement: path.resolve(__dirname, "ui-agent/src") },
    ],
  },
  test: {
    ...sharedVitestConfig.test,
    globals: true,
    include: ["ui-agent/src/lib/chat/session-message.test.ts"],
  },
});
