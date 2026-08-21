import { EmbedBuilder, MessageFlags, SlashCommandBuilder, time, TimestampStyles, type ChatInputCommandInteraction } from "discord.js";
import type { BotCommand } from "../types.js";

export const userinfoCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder().setName("userinfo").setDescription("Muestra información de un usuario.").addUserOption((option) => option.setName("usuario").setDescription("Usuario que quieres consultar.")),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    const user = interaction.options.getUser("usuario") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const roles = member?.roles.cache.filter((role) => role.id !== interaction.guild.id).sort((a, b) => b.position - a.position).first(10);
    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || 0x190c05)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Sí" : "No", inline: true },
        { name: "Cuenta creada", value: `${time(user.createdAt, TimestampStyles.LongDateTime)}\n${time(user.createdAt, TimestampStyles.RelativeTime)}` },
        { name: "Entró al servidor", value: member?.joinedAt ? `${time(member.joinedAt, TimestampStyles.LongDateTime)}\n${time(member.joinedAt, TimestampStyles.RelativeTime)}` : "No pertenece al servidor." },
        { name: "Roles", value: roles?.length ? roles.join(" ").slice(0, 1024) : "Sin roles adicionales." },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
