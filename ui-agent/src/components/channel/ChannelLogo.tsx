"use client";

const CHANNEL_LOGO_ALIAS: Record<string, string> = {
  zalouser: "zalo-user",
  "synology-chat": "synology",
  synologychat: "synology",
};

const CHANNEL_LOGO_BG_CLASS: Record<string, string> = {
  telegram: "bg-[#229ED9]/10",
  whatsapp: "bg-[#25D366]/10",
  discord: "bg-[#5865F2]/10",
  slack: "bg-[#4A154B]/10",
  signal: "bg-[#3A76F0]/10",
  imessage: "bg-[#34C759]/10",
  line: "bg-[#06C755]/10",
  irc: "bg-[#6B7280]/10",
  googlechat: "bg-[#0F9D58]/10",
  matrix: "bg-[#111827]/10",
  msteams: "bg-[#5B5FC7]/10",
  zalo: "bg-[#0068FF]/10",
  "zalo-user": "bg-[#0068FF]/10",
  bluebubbles: "bg-[#0EA5E9]/10",
  twitch: "bg-[#9146FF]/10",
  mattermost: "bg-[#0058CC]/10",
  feishu: "bg-[#00A3FF]/10",
  synology: "bg-[#B5B5B6]/10",
  nostr: "bg-[#6D28D9]/10",
  tlon: "bg-[#0EA5E9]/10",
};

function normalizeChannelLogoId(channelId: string): string {
  return CHANNEL_LOGO_ALIAS[channelId] ?? channelId;
}

function getChannelAbbr(label: string): string {
  const normalized = label.trim().replace(/\s+/g, "");
  return (normalized.slice(0, 2) || "CH").toUpperCase();
}

interface ChannelLogoProps {
  channelId: string;
  label: string;
  selected?: boolean;
}

export function ChannelLogo({ channelId, label, selected = false }: ChannelLogoProps) {
  const normalizedId = normalizeChannelLogoId(channelId);
  const src = `/img/channels/${normalizedId}.svg`;
  const bgClass = CHANNEL_LOGO_BG_CLASS[normalizedId] ?? "bg-background-secondary";

  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${bgClass} ${
        selected ? "ring-1 ring-primary/30" : ""
      }`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="h-4 w-4 object-contain"
        onError={(event) => {
          const target = event.currentTarget;
          target.style.display = "none";
          const fallback = target.nextElementSibling as HTMLSpanElement | null;
          if (fallback) {
            fallback.style.display = "inline";
          }
        }}
      />
      <span className="hidden text-[10px] font-semibold text-text-secondary">
        {getChannelAbbr(label)}
      </span>
    </span>
  );
}
