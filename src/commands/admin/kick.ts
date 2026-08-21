import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { auditReason, moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const kickCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.KickMembers,
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un miembro del servidor sin banearlo.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro que será expulsado.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("motivo")
        .setDescription("Motivo de la expulsión.")
        .setRequired(true)
        .setMaxLength(300),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply();
    const target = interaction.options.getMember("usuario");
    if (!target) return void (await interaction.editReply("Ese usuario no pertenece al servidor."));
    const denial = moderationDenialReason(interaction.member, target);
    if (denial) return void (await interaction.editReply(denial));
    if (!target.kickable) return void (await interaction.editReply("Discord no me permite expulsar a ese miembro."));

    const reason = interaction.options.getString("motivo", true).trim();
    await target.kick(auditReason(interaction, reason));
    const caseNumber = await recordModerationCase(interaction, "Expulsión", reason, { id: target.id, tag: target.user.tag });
    const embed = new EmbedBuilder()
      .setColor(0x190c05)
      .setTitle("Miembro expulsado")
      .setDescription(`**${target.user.tag}** fue expulsado del servidor.`)
      .addFields(
        { name: "Motivo", value: reason },
        { name: "Moderador", value: `${interaction.user}` },
      )
      .setTimestamp();
    if (caseNumber) embed.setFooter({ text: `Caso #${caseNumber}` });
    await interaction.editReply({ embeds: [embed] });
  },
};
