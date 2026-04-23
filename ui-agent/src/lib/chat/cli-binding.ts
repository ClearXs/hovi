export type CliSoftwareBinding = {
  softwareKey: string;
  name?: string;
  generationSessionKey?: string;
  software?: CliSoftwareCard;
};

export type CliSoftwareCard = {
  id: string;
  name: string;
  softwareKey: string;
  packageName?: string;
  cliCommand?: string;
  engine: string;
  targetType: string;
  source: string;
  targetLocator: string;
  targetSummary: string;
  generatedRelativePath: string;
};

export function toCliBinding(card: CliSoftwareCard): CliSoftwareBinding {
  return { softwareKey: card.softwareKey };
}

export function buildCliBindingInjectedMessage(
  message: string,
  binding: CliSoftwareBinding | null | undefined,
  targetMetadata?: string | null,
): string {
  const headers: string[] = [];
  if (binding) {
    headers.push(`[cli-binding: ${binding.softwareKey}]`);
  }
  if (targetMetadata?.trim()) {
    headers.push(targetMetadata.trim());
  }
  if (headers.length === 0) return message;
  return `${headers.join("\n")}\n${message}`;
}

export function stripCliBindingMetadata(text: string): string {
  return text.replace(/^\[cli-binding: [^\]]*\]\n?/gm, "").replace(/^\[cli-target: .*\]\n?/gm, "");
}
