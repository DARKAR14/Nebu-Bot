import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildInviteMessage } from "../../invitations/invite-message.js";
import { buildBanMessage } from "../../moderation/ban-message.js";
import type { BotCommand, CommandContext } from "../types.js";

export const testCommand: BotCommand = {
  active: true,
  access: "dev",
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Envía por DM una vista previa de los mensajes del bot.")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("tipo")
        .setDescription("Mensaje que quieres probar.")
        .setRequired(true)
        .addChoices(
          { name: "Invitación", value: "invitacion" },
          { name: "Baneo", value: "baneo" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("motivo")
        .setDescription("Motivo que aparecerá en la prueba de baneo.")
        .setMaxLength(300),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "Este comando solo se puede ejecutar dentro del servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const previewType = interaction.options.getString("tipo", true);
    const previewMessage =
      previewType === "baneo"
        ? buildBanMessage({
            guild: interaction.guild,
            moderator: interaction.user,
            target: interaction.user,
            reason:
              interaction.options.getString("motivo") ??
              "Incumplimiento de las normas de convivencia de la comunidad.",
            preview: true,
          })
        : buildInviteMessage({
            guild: interaction.guild,
            inviter: interaction.user,
            target: interaction.user,
            expiresAt: new Date(
              Date.now() + context.config.inviteMaxAgeSeconds * 1_000,
            ),
            preview: true,
          });

    try {
      await interaction.user.send(previewMessage);
    } catch {
      await interaction.editReply(
        "No pude enviarte la prueba por DM. Habilita los mensajes directos de este servidor y vuelve a intentarlo.",
      );
      return;
    }

    await interaction.editReply(
      previewType === "baneo"
        ? "Te envié por DM la vista previa del mensaje de baneo."
        : "Te envié por DM la vista previa de la invitación. El botón está deshabilitado porque `/test` no crea una invitación real.",
    );
  },
};
