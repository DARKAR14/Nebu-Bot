import { EmbedBuilder, type Guild } from "discord.js";
import { getDatabase } from "../database/mongodb.js";
import { getGuildSettings } from "../guild-settings/store.js";

export interface ModerationCaseInput {
  guild: Guild;
  moderatorId: string;
  moderatorTag: string;
  targetId?: string;
  targetTag?: string;
  action: string;
  reason?: string | null;
  details?: string;
}

export interface ModerationCaseRecord {
  guildId: string;
  caseNumber: number;
  moderatorId: string;
  moderatorTag: string;
  targetId: string | null;
  targetTag: string | null;
  action: string;
  reason: string;
  details: string | null;
  createdAt: Date;
}

interface CounterDocument {
  _id: string;
  value: number;
}

export async function createModerationCase(input: ModerationCaseInput): Promise<number> {
  const counter = await getDatabase()
    .collection<CounterDocument>("guild_counters")
    .findOneAndUpdate(
      { _id: `moderation:${input.guild.id}` },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  const caseNumber = counter?.value ?? 1;
  const createdAt = new Date();

  await getDatabase().collection("moderation_cases").insertOne({
    guildId: input.guild.id,
    caseNumber,
    moderatorId: input.moderatorId,
    moderatorTag: input.moderatorTag,
    targetId: input.targetId ?? null,
    targetTag: input.targetTag ?? null,
    action: input.action,
    reason: input.reason?.trim() || "Sin motivo especificado",
    details: input.details ?? null,
    createdAt,
  });

  const settings = await getGuildSettings(input.guild.id);
  if (!settings.moderationLogChannelId) return caseNumber;
  const channel = await input.guild.channels
    .fetch(settings.moderationLogChannelId)
    .catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) return caseNumber;

  const embed = new EmbedBuilder()
    .setColor(0x190c05)
    .setTitle(`Caso de moderación #${caseNumber}`)
    .addFields(
      { name: "Sanción/acción", value: input.action, inline: true },
      { name: "Responsable", value: `<@${input.moderatorId}>\n${input.moderatorTag}`, inline: true },
      {
        name: "Usuario",
        value: input.targetId ? `<@${input.targetId}>\n${input.targetTag ?? input.targetId}` : "No aplica",
        inline: true,
      },
      { name: "Motivo", value: input.reason?.trim() || "Sin motivo especificado" },
    )
    .setTimestamp(createdAt);
  if (input.details) embed.addFields({ name: "Detalles", value: input.details.slice(0, 1024) });
  await channel.send({ embeds: [embed] }).catch(() => undefined);
  return caseNumber;
}

export async function getModerationCase(
  guildId: string,
  caseNumber: number,
): Promise<ModerationCaseRecord | null> {
  return getDatabase().collection<ModerationCaseRecord>("moderation_cases").findOne({ guildId, caseNumber });
}
