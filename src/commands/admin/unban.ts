import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { auditReason, recordModerationCase, requireGuild } from "./moderation.js";

const USER_ID_PATTERN = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/;

export const unbanCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.BanMembers,
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Retira el baneo de una cuenta mediante su userID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) =>
      option
        .setName("userid")
        .setDescription("ID o mención de la cuenta baneada.")
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(23),
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("Motivo para retirar el baneo.").setMaxLength(300),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const match = interaction.options.getString("userid", true).trim().match(USER_ID_PATTERN);
    const userId = match?.[1] ?? match?.[2];
    if (!userId) return void (await interaction.editReply("Indica un userID o una mención válida."));

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return void (await interaction.editReply("Esa cuenta no está baneada en este servidor."));
    const publicReason = interaction.options.getString("motivo");
    await interaction.guild.bans.remove(
      userId,
      auditReason(interaction, publicReason),
    );
    const caseNumber = await recordModerationCase(interaction, "Desbaneo", publicReason, { id: ban.user.id, tag: ban.user.tag });
    await interaction.editReply(`Se retiró el baneo de **${ban.user.tag}**. Caso #${caseNumber}.`);
  },
};
