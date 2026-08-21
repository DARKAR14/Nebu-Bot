import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { auditReason, moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const muteVoiceCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.MuteMembers,
  data: new SlashCommandBuilder()
    .setName("mute-voice")
    .setDescription("Silencia en voz a un miembro conectado.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro que será silenciado.").setRequired(true),
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

    if (!target.voice.channelId) {
      await interaction.editReply("Ese miembro no está conectado a un canal de voz.");
      return;
    }

    const publicReason = interaction.options.getString("motivo");
    await target.voice.setMute(true, auditReason(interaction, publicReason));
    const caseNumber = await recordModerationCase(interaction, "Mute de voz", publicReason, { id: target.id, tag: target.user.tag });
    await interaction.editReply(`${target} fue silenciado en los canales de voz. Caso #${caseNumber}.`);
  },
};
