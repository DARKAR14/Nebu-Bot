import {
  ActionRowBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { stageCommission } from "../../designer-system/interactions.js";
import {
  getAvailableDesignerIds,
  getDesignerConfig,
} from "../../designer-system/store.js";
import type { BotCommand } from "../types.js";

export const comisionCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("comision")
    .setDescription("Contrata a un Designer disponible para un trabajo.")
    .addStringOption((option) =>
      option
        .setName("trabajo")
        .setDescription("Describe brevemente la comisión que necesitas.")
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = await getDesignerConfig(interaction.guild.id);
    if (!config) {
      await interaction.editReply("El sistema de diseñadores todavía no está configurado.");
      return;
    }

    const availableIds = await getAvailableDesignerIds(interaction.guild.id);
    const members = (
      await Promise.all(
        availableIds.map((id) => interaction.guild.members.fetch(id).catch(() => null)),
      )
    )
      .filter(
        (member) =>
          member?.id !== interaction.user.id && member?.roles.cache.has(config.roleId),
      )
      .slice(0, 25);

    if (!members.length) {
      await interaction.editReply("Ahora mismo no hay diseñadores disponibles para comisiones.");
      return;
    }

    const work = interaction.options.getString("trabajo", true).trim();
    stageCommission(interaction.guild.id, interaction.user.id, work);
    const select = new StringSelectMenuBuilder()
      .setCustomId(`commission-select:${interaction.guild.id}:${interaction.user.id}`)
      .setPlaceholder("Elige al Designer que quieres contratar")
      .addOptions(
        members.map((member) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(member!.displayName.slice(0, 100))
            .setDescription(`@${member!.user.username} · Disponible`)
            .setValue(member!.id),
        ),
      );

    await interaction.editReply({
      content: `**Tu comisión:** ${work}\n\nSelecciona un diseñador disponible:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    });
  },
};
