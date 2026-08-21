import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getDesignerConfig,
  setDesignerAvailability,
} from "../../designer-system/store.js";
import type { BotCommand } from "../types.js";

export const statusCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Cambia tu disponibilidad para aceptar comisiones.")
    .addStringOption((option) =>
      option
        .setName("estado")
        .setDescription("Tu disponibilidad actual.")
        .setRequired(true)
        .addChoices(
          { name: "Disponible", value: "available" },
          { name: "No disponible", value: "unavailable" },
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await getDesignerConfig(interaction.guild.id);
    if (!config || !interaction.member.roles.cache.has(config.roleId)) {
      await interaction.reply({
        content: "Solo quienes tienen el rol Designer pueden usar este comando.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const available = interaction.options.getString("estado", true) === "available";
    await setDesignerAvailability(interaction.guild.id, interaction.user.id, available);
    await interaction.reply({
      content: available
        ? "Tu estado ahora es **Disponible**. Los usuarios podrán elegirte para una comisión."
        : "Tu estado ahora es **No disponible**. No aparecerás en `/comision`.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
