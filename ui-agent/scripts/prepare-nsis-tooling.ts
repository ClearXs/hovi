import os from "node:os";
import { prepareNsisTooling } from "./prepare-nsis-tooling.shared";

async function main() {
  const result = await prepareNsisTooling({
    env: process.env,
    homeDir: os.homedir(),
    platform: process.platform,
  });

  if (result.skipped) {
    console.log(`skip nsis tooling preparation on ${process.platform}`);
    return;
  }

  if (result.downloaded) {
    console.log(`nsis helper prepared at ${result.targetPath}`);
    return;
  }

  console.log(`nsis helper already ready at ${result.targetPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
