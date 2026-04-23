import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "./vitest.shared.config.ts";

export default defineConfig({
  ...sharedVitestConfig,
  test: {
    ...sharedVitestConfig.test,
    include: [
      "src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.emit-block-chunk-empty.test.ts",
      "src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.compaction-retry-state-reset.test.ts",
    ],
  },
});
