export const GATEWAY_CLIENT_IDS = {
  WEBCHAT_UI: "webchat-ui",
  CONTROL_UI: "openclaw-control-ui",
  WEBCHAT: "webchat",
  CLI: "cli",
  GATEWAY_CLIENT: "gateway-client",
  MACOS_APP: "openclaw-macos",
  IOS_APP: "openclaw-ios",
  ANDROID_APP: "openclaw-android",
  NODE_HOST: "node-host",
  TEST: "test",
  FINGERPRINT: "fingerprint",
  PROBE: "openclaw-probe",
} as const;

export type GatewayClientId = (typeof GATEWAY_CLIENT_IDS)[keyof typeof GATEWAY_CLIENT_IDS];

export const GATEWAY_CLIENT_NAMES = GATEWAY_CLIENT_IDS;
export type GatewayClientName = GatewayClientId;

const LEGACY_HOVI_CONTROL_UI_IDS = new Set([GATEWAY_CLIENT_IDS.WEBCHAT_UI, "ui-agent-web"]);

export function normalizeGatewayClientId(value?: string | null): GatewayClientId {
  const trimmed = value?.trim();
  if (!trimmed || LEGACY_HOVI_CONTROL_UI_IDS.has(trimmed)) {
    return GATEWAY_CLIENT_IDS.CONTROL_UI;
  }
  return trimmed as GatewayClientId;
}

export const GATEWAY_CLIENT_MODES = {
  WEBCHAT: "webchat",
  CLI: "cli",
  UI: "ui",
  BACKEND: "backend",
  NODE: "node",
  PROBE: "probe",
  TEST: "test",
} as const;

export type GatewayClientMode = (typeof GATEWAY_CLIENT_MODES)[keyof typeof GATEWAY_CLIENT_MODES];
