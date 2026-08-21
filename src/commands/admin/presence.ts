import {
  ActivityType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  applyPresence,
  savePresence,
  type BotPresenceStatus,
  type StoredPresence,
} from "../../presence/store.js";
import type { BotCommand } from "../types.js";

const ACTIVITY_TYPES: Record<string, StoredPresence["activityType"]> = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
};

export const presenceCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName("presence")
    .setDescription("Cambia la actividad y el estado visible del bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("texto")
        .setDescription("Texto que mostrará la actividad del bot.")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(128),
    )
    .addStringOption((option) =>
      option
        .setName("actividad")
        .setDescription("Tipo de actividad que se mostrará.")
        .setRequired(true)
        .addChoices(
          { name: "Jugando", value: "playing" },
          { name: "Viendo", value: "watching" },
          { name: "Escuchando", value: "listening" },
          { name: "Compitiendo", value: "competing" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("estado")
        .setDescription("Estado de conexión del bot.")
        .setRequired(true)
        .addChoices(
          { name: "En línea", value: "online" },
          { name: "Ausente", value: "idle" },
          { name: "No molestar", value: "dnd" },
          { name: "Invisible", value: "invisible" },
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const text = interaction.options.getString("texto", true).trim();
    const activityType = ACTIVITY_TYPES[
      interaction.options.getString("actividad", true)
    ];
    const status = interaction.options.getString("estado", true) as BotPresenceStatus;

    if (activityType === undefined || !["online", "idle", "dnd", "invisible"].includes(status)) {
      await interaction.reply({
        content: "La actividad o el estado indicado no es válido.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const presence: StoredPresence = { text, activityType, status };
    if (!interaction.client.isReady()) {
      await interaction.reply({
        content: "El bot todavía no está listo para cambiar su presencia.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    applyPresence(interaction.client, presence);
    await savePresence(presence);
    await interaction.reply({
      content: `Presencia actualizada globalmente: **${text}** · estado **${status}**.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
