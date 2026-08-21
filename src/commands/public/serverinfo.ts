import { ChannelType, EmbedBuilder, MessageFlags, SlashCommandBuilder, time, TimestampStyles, type ChatInputCommandInteraction } from "discord.js";
import type { BotCommand } from "../types.js";

export const serverinfoCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Muestra información del servidor."),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    const guild = interaction.guild;
    const textChannels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildVoice).size;
    const embed = new EmbedBuilder()
      .setColor(0x190c05)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: "ID", value: guild.id, inline: true },
        { name: "Dueño", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Miembros", value: guild.memberCount.toLocaleString("es"), inline: true },
        { name: "Canales", value: `Texto: ${textChannels}\nVoz: ${voiceChannels}`, inline: true },
        { name: "Roles", value: String(guild.roles.cache.size), inline: true },
        { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} · Nivel ${guild.premiumTier}`, inline: true },
        { name: "Creado", value: `${time(guild.createdAt, TimestampStyles.LongDateTime)}\n${time(guild.createdAt, TimestampStyles.RelativeTime)}` },
      );
    const banner = guild.bannerURL({ size: 1024 });
    if (banner) embed.setImage(banner);
    await interaction.reply({ embeds: [embed] });
  },
};
