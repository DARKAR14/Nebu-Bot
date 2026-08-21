import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getModerationCase } from "../../moderation/cases.js";
import type { BotCommand } from "../types.js";

export const casoCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName("caso")
    .setDescription("Consulta un caso de moderación por su número.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((option) => option.setName("numero").setDescription("Número del caso.").setRequired(true).setMinValue(1)),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    const record = await getModerationCase(interaction.guild.id, interaction.options.getInteger("numero", true));
    if (!record) return void (await interaction.reply({ content: "No existe ese caso en este servidor.", flags: MessageFlags.Ephemeral }));
    const embed = new EmbedBuilder()
      .setColor(0x190c05)
      .setTitle(`Caso de moderación #${record.caseNumber}`)
      .addFields(
        { name: "Acción", value: record.action, inline: true },
        { name: "Responsable", value: `<@${record.moderatorId}>\n${record.moderatorTag}`, inline: true },
        { name: "Usuario", value: record.targetId ? `<@${record.targetId}>\n${record.targetTag ?? record.targetId}` : "No aplica", inline: true },
        { name: "Motivo", value: record.reason },
      )
      .setTimestamp(record.createdAt);
    if (record.details) embed.addFields({ name: "Detalles", value: record.details });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
