import { EmbedBuilder, type Client } from "discord.js";
import { getGuildSettings } from "../guild-settings/store.js";

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.stack ?? error.message : String(error);
  return raw
    .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, "mongodb://***:***@")
    .replace(/cloudinary:\/\/[^@\s]+@/gi, "cloudinary://***:***@");
}

export async function reportImportantError(
  client: Client,
  error: unknown,
  context: string,
  guildId?: string | null,
): Promise<void> {
  console.error(`[ERROR] ${context}:`, error);
  const detail = errorText(error).replace(/`/g, "ˋ").slice(0, 3500);
  const guilds = guildId
    ? [client.guilds.cache.get(guildId)].filter((guild) => guild !== undefined)
    : [...client.guilds.cache.values()];
  for (const guild of guilds) {
    const settings = await getGuildSettings(guild.id).catch(() => null);
    if (!settings?.errorChannelId) continue;
    const channel = await guild.channels.fetch(settings.errorChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) continue;
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Error importante del bot")
        .addFields({ name: "Contexto", value: context.slice(0, 1024) }, { name: "Detalle", value: `\`\`\`\n${detail}\n\`\`\`` })
        .setTimestamp()],
    }).catch(() => undefined);
  }
}
