import { AttachmentBuilder, EmbedBuilder, type Client, type Guild } from "discord.js";
import { getDatabase } from "../database/mongodb.js";
import { getGuildSettings, updateGuildSettings } from "../guild-settings/store.js";

const BACKUP_COLLECTIONS = [
  "guild_settings",
  "designer_guilds",
  "designer_applications",
  "designer_availability",
  "designer_profiles",
  "moderation_cases",
  "commissions",
  "commission_reviews",
  "guild_counters",
  "bot_settings",
  "birthdays",
] as const;

export async function createAndSendGuildBackup(guild: Guild): Promise<boolean> {
  const settings = await getGuildSettings(guild.id);
  if (!settings.backupChannelId) return false;
  const channel = await guild.channels.fetch(settings.backupChannelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) return false;
  const database = getDatabase();
  const data: Record<string, unknown[]> = {};
  for (const collectionName of BACKUP_COLLECTIONS) {
    const query = collectionName === "guild_counters"
      ? { _id: { $in: [`moderation:${guild.id}`, `commission:${guild.id}`] } }
      : collectionName === "bot_settings"
        ? { _id: "presence" }
        : { $or: [{ guildId: guild.id }, { _id: guild.id }] };
    data[collectionName] = await database.collection<any>(collectionName).find(query).toArray();
  }
  const createdAt = new Date();
  const payload = JSON.stringify({ version: 1, guild: { id: guild.id, name: guild.name }, createdAt, collections: data }, null, 2);
  const date = createdAt.toISOString().replace(/[:.]/g, "-");
  const attachment = new AttachmentBuilder(Buffer.from(payload, "utf8"), { name: `nebu-backup-${guild.id}-${date}.json` });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x190c05).setTitle("Copia de seguridad de Nebu").setDescription(`Datos persistentes de **${guild.name}**.`).setTimestamp(createdAt)],
    files: [attachment],
  });
  await updateGuildSettings(guild.id, { lastBackupAt: createdAt });
  return true;
}

export function startBackupScheduler(client: Client): NodeJS.Timeout {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      const settings = await getGuildSettings(guild.id).catch(() => null);
      if (!settings?.backupChannelId) continue;
      if (settings.lastBackupAt && Date.now() - settings.lastBackupAt.getTime() < 24 * 60 * 60_000) continue;
      await createAndSendGuildBackup(guild).catch((error: unknown) => console.error(`[BACKUP] Falló el backup de ${guild.name}:`, error));
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60 * 60_000);
  timer.unref();
  return timer;
}
