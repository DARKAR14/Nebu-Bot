import { EmbedBuilder, type GuildMember } from "discord.js";
import type { GuildSettings } from "../guild-settings/store.js";

export const DEFAULT_BOOST_EMBED = {
  title: "🚀 ¡{usuario} ha impulsado el servidor!",
  description:
    "Muchas gracias, {mencion}, por apoyar a **{servidor}**. Tu boost ayuda a que nuestra comunidad siga creciendo entre las estrellas.",
  imageUrl: "",
} as const;

function replaceVariables(value: string, member: GuildMember): string {
  return value
    .replaceAll("{usuario}", member.displayName)
    .replaceAll("{mencion}", member.toString())
    .replaceAll("{servidor}", member.guild.name)
    .replaceAll("{boosts}", String(member.guild.premiumSubscriptionCount ?? 0));
}

export function buildBoostEmbed(
  member: GuildMember,
  configured?: GuildSettings["boostEmbed"],
): EmbedBuilder {
  const template = configured ?? DEFAULT_BOOST_EMBED;
  const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256 });
  const imageUrl =
    template.imageUrl ||
    member.guild.bannerURL({ extension: "png", size: 1024 }) ||
    avatarUrl;

  return new EmbedBuilder()
    .setColor(0x190c05)
    .setTitle(replaceVariables(template.title, member))
    .setDescription(replaceVariables(template.description, member))
    .setThumbnail(avatarUrl)
    .setImage(imageUrl)
    .addFields({
      name: "Boosts del servidor",
      value: String(member.guild.premiumSubscriptionCount ?? 0),
      inline: true,
    })
    .setFooter({ text: `Gracias por apoyar a ${member.guild.name}` })
    .setTimestamp();
}
