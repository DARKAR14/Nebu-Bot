import {
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
  type ModalSubmitInteraction,
} from "discord.js";
import { updateGuildSettings } from "../guild-settings/store.js";
import { buildBoostEmbed } from "./embed.js";

function validImageUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function handleBoostEmbedModal(
  interaction: ModalSubmitInteraction,
  developerUserId: string,
): Promise<void> {
  const [, guildId, userId] = interaction.customId.split(":");
  if (
    !interaction.inCachedGuild() ||
    guildId !== interaction.guild.id ||
    userId !== interaction.user.id
  ) {
    await interaction.reply({
      content: "Este formulario no te pertenece o ya no es válido.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const allowed =
    interaction.user.id === developerUserId ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
  if (!allowed) {
    await interaction.reply({
      content: "Solo los administradores pueden configurar el anuncio de boosts.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const imageUrl = interaction.fields.getTextInputValue("image-url").trim();
  if (!validImageUrl(imageUrl)) {
    await interaction.reply({
      content: "La imagen debe ser una URL válida que comience con `https://` o `http://`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const boostEmbed = { title, description, imageUrl };
  await updateGuildSettings(interaction.guild.id, { boostEmbed });
  await interaction.reply({
    content: "Configuración guardada. Esta es la vista previa:",
    embeds: [buildBoostEmbed(interaction.member, boostEmbed)],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleBoostInteraction(
  interaction: Interaction,
  developerUserId: string,
): Promise<boolean> {
  if (interaction.isModalSubmit() && interaction.customId.startsWith("boost-embed:")) {
    await handleBoostEmbedModal(interaction, developerUserId);
    return true;
  }
  return false;
}
