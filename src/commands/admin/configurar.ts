import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { updateGuildSettings } from "../../guild-settings/store.js";
import type { BotCommand } from "../types.js";

export const configurarCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName("configurar")
    .setDescription("Configura los canales de los sistemas del bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("moderacion")
        .setDescription("Canal para los casos de moderación.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal de logs.").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("errores")
        .setDescription("Canal para errores importantes del bot.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal de errores.").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("backups")
        .setDescription("Canal para las copias de seguridad.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal de backups.").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("tickets")
        .setDescription("Categoría donde se crearán los tickets de comisión.")
        .addChannelOption((option) =>
          option.setName("categoria").setDescription("Categoría privada.").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel(subcommand === "tickets" ? "categoria" : "canal", true);
    const key = {
      moderacion: "moderationLogChannelId",
      errores: "errorChannelId",
      backups: "backupChannelId",
      tickets: "ticketCategoryId",
    }[subcommand] as "moderationLogChannelId" | "errorChannelId" | "backupChannelId" | "ticketCategoryId";
    await updateGuildSettings(interaction.guild.id, { [key]: channel.id });
    await interaction.reply({ content: `Configuración **${subcommand}** guardada en ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
