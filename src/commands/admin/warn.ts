import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { moderationDenialReason, recordModerationCase, requireGuild } from "./moderation.js";

export const warnCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Envía una advertencia formal por DM a un miembro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("usuario").setDescription("Miembro que será advertido.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("motivo")
        .setDescription("Motivo de la advertencia.")
        .setRequired(true)
        .setMaxLength(500),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getMember("usuario");
    if (!target) return void (await interaction.editReply("Ese usuario no pertenece al servidor."));
    const denial = moderationDenialReason(interaction.member, target);
    if (denial) return void (await interaction.editReply(denial));

    const reason = interaction.options.getString("motivo", true).trim();
    const embed = new EmbedBuilder()
      .setColor(0x190c05)
      .setTitle(`Advertencia de ${interaction.guild.name}`)
      .setDescription(
        `Has recibido una advertencia formal del equipo de moderación.\n\n**Motivo**\n${reason}`,
      )
      .addFields({ name: "Moderador", value: interaction.user.tag })
      .setThumbnail(interaction.guild.iconURL({ size: 256 }))
      .setTimestamp();

    const delivered = await target.send({ embeds: [embed] }).then(() => true).catch(() => false);
    const caseNumber = await recordModerationCase(interaction, "Advertencia", reason, { id: target.id, tag: target.user.tag }, `DM: ${delivered ? "entregado" : "bloqueado"}`);
    console.log(`[WARN] ${target.user.tag} advertido por ${interaction.user.tag}: ${reason}`);
    await interaction.editReply(
      delivered
        ? `Advertencia enviada por DM a ${target.user.tag}. Caso #${caseNumber}.`
        : `La advertencia quedó registrada como caso #${caseNumber}, pero Discord bloqueó el DM a ${target.user.tag}.`,
    );
  },
};
