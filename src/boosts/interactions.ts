import {
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getGuildSettings, updateGuildSettings } from "../guild-settings/store.js";
import { deleteBoostImage, uploadBoostImage } from "../media/cloudinary.js";
import { buildBoostEmbed } from "./embed.js";

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
  const uploadedFile = interaction.fields.getUploadedFiles("image")?.first();
  const previous = (await getGuildSettings(interaction.guild.id)).boostEmbed;
  if (!uploadedFile && !previous?.imageUrl) {
    await interaction.reply({
      content: "Debes seleccionar una imagen para crear el embed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (uploadedFile?.contentType && !uploadedFile.contentType.startsWith("image/")) {
    await interaction.reply({
      content: "El archivo seleccionado debe ser una imagen.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let uploadedImage = null;
  try {
    uploadedImage = uploadedFile
      ? await uploadBoostImage(uploadedFile.url, interaction.guild.id)
      : null;
  } catch (error: unknown) {
    console.error("No se pudo subir la imagen de boost a Cloudinary:", error);
    await interaction.editReply("No pude guardar la imagen en Cloudinary. Inténtalo nuevamente.");
    return;
  }

  const imageUrl = uploadedImage?.secureUrl ?? previous!.imageUrl;
  const imagePublicId = uploadedImage?.publicId ?? previous?.imagePublicId;
  const boostEmbed = {
    title,
    description,
    imageUrl,
    ...(imagePublicId ? { imagePublicId } : {}),
  };
  try {
    await updateGuildSettings(interaction.guild.id, { boostEmbed });
  } catch (error: unknown) {
    if (uploadedImage) await deleteBoostImage(uploadedImage.publicId).catch(() => undefined);
    throw error;
  }
  if (uploadedImage && previous?.imagePublicId) {
    await deleteBoostImage(previous.imagePublicId).catch((error: unknown) => {
      console.error("No se pudo eliminar la imagen anterior de boost:", error);
    });
  }

  await interaction.editReply({
    content: "Configuración guardada. Esta es la vista previa:",
    embeds: [buildBoostEmbed(interaction.member, boostEmbed)],
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
