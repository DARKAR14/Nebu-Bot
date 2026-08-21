import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { recordModerationCase, requireGuild } from "./moderation.js";

export const clearCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageMessages,
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Elimina mensajes recientes del canal actual.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("cantidad")
        .setDescription("Cantidad de mensajes entre 1 y 100.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await requireGuild(interaction)) || !interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    if (!channel || !("bulkDelete" in channel) || typeof channel.bulkDelete !== "function") {
      await interaction.editReply("Este canal no permite eliminar mensajes en bloque.");
      return;
    }

    const amount = interaction.options.getInteger("cantidad", true);
    const deleted = await channel.bulkDelete(amount, true);
    const caseNumber = await recordModerationCase(interaction, "Limpieza de mensajes", "Limpieza solicitada por moderación", undefined, `Canal: #${"name" in channel ? channel.name : interaction.channelId} · Eliminados: ${deleted.size}`);
    await interaction.editReply(
      `Se eliminaron ${deleted.size} mensaje(s). Discord omite automáticamente los mensajes con más de 14 días. Caso #${caseNumber}.`,
    );
  },
};
