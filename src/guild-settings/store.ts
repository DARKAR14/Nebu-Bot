import { getDatabase } from "../database/mongodb.js";

export interface GuildSettings {
  guildId: string;
  moderationLogChannelId?: string;
  errorChannelId?: string;
  backupChannelId?: string;
  ticketCategoryId?: string;
  birthdayChannelId?: string;
  birthdayEmbed?: {
    title: string;
    message: string;
    imageUrl: string;
    imagePublicId?: string;
    color: number;
  };
  lastBackupAt?: Date;
}

interface GuildSettingsDocument extends GuildSettings {
  _id: string;
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const document = await getDatabase()
    .collection<GuildSettingsDocument>("guild_settings")
    .findOne({ _id: guildId });
  if (!document) return { guildId };
  const { _id: _ignored, ...settings } = document;
  return settings;
}

export async function updateGuildSettings(
  guildId: string,
  values: Partial<Omit<GuildSettings, "guildId">>,
): Promise<void> {
  await getDatabase()
    .collection<GuildSettingsDocument>("guild_settings")
    .updateOne(
      { _id: guildId },
      { $set: { guildId, ...values } },
      { upsert: true },
    );
}
