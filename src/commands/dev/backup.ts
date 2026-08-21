import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { createAndSendGuildBackup } from "../../operations/backups.js";
import type { BotCommand } from "../types.js";

export const backupCommand: BotCommand = {
  active: true,
  access: "dev",
  data: new SlashCommandBuilder().setName("backup").setDescription("Crea ahora una copia de seguridad del servidor."),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sent = await createAndSendGuildBackup(interaction.guild);
    await interaction.editReply(sent ? "Backup creado y enviado al canal configurado." : "Configura primero el canal con `/configurar backups`." );
  },
};
