import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { BotCommand } from "../types.js";

export const avatarCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder().setName("avatar").setDescription("Muestra el avatar de un usuario.").addUserOption((option) => option.setName("usuario").setDescription("Usuario cuyo avatar quieres ver.")),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("usuario") ?? interaction.user;
    const url = user.displayAvatarURL({ size: 4096 });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x190c05).setTitle(`Avatar de ${user.tag}`).setDescription(`[Abrir imagen](${url})`).setImage(url)] });
  },
};
