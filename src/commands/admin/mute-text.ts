import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { auditReason, moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const muteTextCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName("mute-text")
    .setDescription("Impide temporalmente que un miembro se comunique en el servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro que será silenciado.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("minutos")
        .setDescription("Duración entre 1 minuto y 28 días.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40_320),
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo de la sanción.").setMaxLength(300),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

    if (!target.moderatable) {
      await interaction.editReply("Discord no me permite aplicar timeout a ese miembro.");
      return;
    }

    const minutes = interaction.options.getInteger("minutos", true);
    const publicReason = interaction.options.getString("motivo");
    await target.timeout(minutes * 60_000, auditReason(interaction, publicReason));
    const caseNumber = await recordModerationCase(interaction, "Mute de texto", publicReason, { id: target.id, tag: target.user.tag }, `Duración: ${minutes} minuto(s)`);
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    await interaction.editReply(
      `${target} no podrá comunicarse hasta ${time(expiresAt, TimestampStyles.LongDateTime)} (${time(expiresAt, TimestampStyles.RelativeTime)}). Caso #${caseNumber}.`,
    );
  },
};
