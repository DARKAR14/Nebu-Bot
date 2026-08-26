import { MessageType, type GuildMember, type Message } from "discord.js";
import { getGuildSettings } from "../guild-settings/store.js";
import { buildBoostEmbed } from "./embed.js";

const recentAnnouncements = new Map<string, number>();
const DEDUPE_WINDOW_MS = 15_000;

async function announceBoost(member: GuildMember): Promise<void> {
  const key = `${member.guild.id}:${member.id}`;
  const now = Date.now();
  const previous = recentAnnouncements.get(key) ?? 0;
  if (now - previous < DEDUPE_WINDOW_MS) return;

  const settings = await getGuildSettings(member.guild.id);
  if (!settings.boostChannelId) return;
  const channel = await member.guild.channels.fetch(settings.boostChannelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) return;
  recentAnnouncements.set(key, now);
  try {
    await channel.send({
      content: member.toString(),
      embeds: [buildBoostEmbed(member, settings.boostEmbed)],
      allowedMentions: { users: [member.id] },
    });
  } catch (error: unknown) {
    recentAnnouncements.delete(key);
    throw error;
  }
}

export async function announceNewBoost(
  oldMember: { premiumSinceTimestamp: number | null },
  newMember: GuildMember,
): Promise<void> {
  if (oldMember.premiumSinceTimestamp !== null || newMember.premiumSinceTimestamp === null) {
    return;
  }

  await announceBoost(newMember);
}

export async function announceBoostMessage(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  const boostTypes = new Set([
    MessageType.GuildBoost,
    MessageType.GuildBoostTier1,
    MessageType.GuildBoostTier2,
    MessageType.GuildBoostTier3,
  ]);
  if (!boostTypes.has(message.type)) return;
  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member) await announceBoost(member);
}
