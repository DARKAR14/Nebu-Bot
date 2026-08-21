import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildBanMessage } from "../../moderation/ban-message.js";
import type { BotCommand } from "../types.js";
import { auditReason, moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const banCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.BanMembers,
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Expulsa y bloquea permanentemente a un miembro del servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro que será baneado.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("motivo")
        .setDescription("Motivo del baneo.")
        .setRequired(true)
        .setMaxLength(300),
    )
    .addIntegerOption((option) =>
      option
        .setName("eliminar_dias")
        .setDescription("Días de mensajes que se eliminarán (0 a 7).")
        .setMinValue(0)
        .setMaxValue(7),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply();

    const target = interaction.options.getMember("usuario");
    if (!target) {
      await interaction.editReply("Ese usuario no pertenece al servidor.");
      return;
    }

    const denial = moderationDenialReason(interaction.member, target);
    if (denial) {
      await interaction.editReply(denial);
      return;
    }

    if (!target.bannable) {
      await interaction.editReply("Discord no me permite banear a ese miembro.");
      return;
    }

    const days = interaction.options.getInteger("eliminar_dias") ?? 0;
    const publicReason = interaction.options.getString("motivo", true).trim();
    // Se notifica antes de expulsarlo: al salir podría dejar de compartir
    // servidor con el bot y Discord bloquearía el DM inmediatamente.
    const dmSent = await target
      .send(
        buildBanMessage({
          guild: interaction.guild,
          target: target.user,
          moderator: interaction.user,
          reason: publicReason,
        }),
      )
      .then(() => true)
      .catch(() => false);

    await target.ban({
      deleteMessageSeconds: days * 86_400,
      reason: auditReason(interaction, publicReason),
    });
    const caseNumber = await recordModerationCase(
      interaction,
      "Baneo",
      publicReason,
      { id: target.id, tag: target.user.tag },
      `Mensajes eliminados: ${days} día(s) · DM: ${dmSent ? "entregado" : "bloqueado"}`,
    );

    const resultEmbed = new EmbedBuilder()
      .setColor(0x190c05)
      .setTitle("Miembro baneado")
      .setDescription(`${target.user.tag} fue baneado de **${interaction.guild.name}**.`)
      .addFields(
        { name: "Motivo", value: publicReason },
        { name: "Moderador", value: `${interaction.user}`, inline: true },
        { name: "Notificación por DM", value: dmSent ? "Entregada" : "No entregada", inline: true },
      )
      .setTimestamp();
    if (caseNumber) resultEmbed.setFooter({ text: `Caso #${caseNumber}` });

    if (days) {
      resultEmbed.addFields({
        name: "Mensajes eliminados",
        value: `${days} día(s)`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [resultEmbed] });
  },
};
