import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { auditReason, moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const unmuteVoiceCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.MuteMembers,
  data: new SlashCommandBuilder()
    .setName("unmute-voice")
    .setDescription("Retira el silencio de servidor a un miembro conectado a voz.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro al que se retirará el silencio.").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo para retirar el silencio.").setMaxLength(300),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getMember("usuario");
    if (!target) return void (await interaction.editReply("Ese usuario no pertenece al servidor."));
    const denial = moderationDenialReason(interaction.member, target);
    if (denial) return void (await interaction.editReply(denial));
    if (!target.voice.channelId) return void (await interaction.editReply("Ese miembro no está conectado a voz."));
    if (!target.voice.serverMute) return void (await interaction.editReply("Ese miembro no tiene silencio de servidor."));
    const publicReason = interaction.options.getString("motivo");
    await target.voice.setMute(false, auditReason(interaction, publicReason));
    const caseNumber = await recordModerationCase(interaction, "Retiro de mute de voz", publicReason, { id: target.id, tag: target.user.tag });
    await interaction.editReply(`Se retiró el silencio de voz de ${target}. Caso #${caseNumber}.`);
  },
};
