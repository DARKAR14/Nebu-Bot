import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { auditReason, moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const unmuteTextCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName("unmute-text")
    .setDescription("Retira el timeout de comunicación de un miembro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro al que se retirará el timeout.").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo para retirar el timeout.").setMaxLength(300),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getMember("usuario");
    if (!target) return void (await interaction.editReply("Ese usuario no pertenece al servidor."));
    const denial = moderationDenialReason(interaction.member, target);
    if (denial) return void (await interaction.editReply(denial));
    if (!target.isCommunicationDisabled()) return void (await interaction.editReply("Ese miembro no tiene un timeout activo."));
    const publicReason = interaction.options.getString("motivo");
    await target.timeout(null, auditReason(interaction, publicReason));
    const caseNumber = await recordModerationCase(interaction, "Retiro de mute de texto", publicReason, { id: target.id, tag: target.user.tag });
    await interaction.editReply(`Se retiró el timeout de ${target}. Caso #${caseNumber}.`);
  },
};
