import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getGuildSettings, updateGuildSettings } from "../guild-settings/store.js";
import { deleteBirthdayImage, uploadBirthdayImage } from "../media/cloudinary.js";

function parseColor(value: string): number | null {
  const normalized = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return null;
  return Number.parseInt(normalized.slice(1), 16);
}

function replaceVariables(value: string, interaction: ModalSubmitInteraction<"cached">): string {
  return value
    .replaceAll("{usuario}", interaction.member.displayName)
    .replaceAll("{mencion}", interaction.user.toString())
    .replaceAll("{servidor}", interaction.guild.name);
}

async function handleBirthdayEmbedModal(
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
      content: "Solo los administradores pueden configurar este embed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue("title").trim();
  const message = interaction.fields.getTextInputValue("message").trim();
  const colorText = interaction.fields.getTextInputValue("color").trim();
  const color = parseColor(colorText);
  const uploadedFile = interaction.fields.getUploadedFiles("image")?.first();
  const previous = (await getGuildSettings(interaction.guild.id)).birthdayEmbed;
  if (uploadedFile && !uploadedFile.contentType?.startsWith("image/")) {
    await interaction.reply({
      content: "El archivo debe ser una imagen válida.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!uploadedFile && !previous?.imageUrl) {
    await interaction.reply({
      content: "Debes subir una imagen para crear el embed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (color === null) {
    await interaction.reply({
      content: "El color debe tener el formato hexadecimal `#190c05`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let uploadedImage = null;
  try {
    uploadedImage = uploadedFile
      ? await uploadBirthdayImage(uploadedFile.url, interaction.guild.id)
      : null;
  } catch (error: unknown) {
    console.error("No se pudo subir la imagen de cumpleaños a Cloudinary:", error);
    await interaction.editReply("No pude guardar la imagen en Cloudinary. Inténtalo nuevamente.");
    return;
  }
  const imageUrl = uploadedImage?.secureUrl ?? previous!.imageUrl;
  const imagePublicId = uploadedImage?.publicId ?? previous?.imagePublicId;
  try {
    await updateGuildSettings(interaction.guild.id, {
      birthdayEmbed: {
        title,
        message,
        imageUrl,
        ...(imagePublicId ? { imagePublicId } : {}),
        color,
      },
    });
  } catch (error: unknown) {
    if (uploadedImage) await deleteBirthdayImage(uploadedImage.publicId).catch(() => undefined);
    throw error;
  }
  if (uploadedImage && previous?.imagePublicId) {
    await deleteBirthdayImage(previous.imagePublicId).catch((error: unknown) => {
      console.error("No se pudo eliminar la imagen anterior de cumpleaños:", error);
    });
  }
  const preview = new EmbedBuilder()
    .setColor(color)
    .setTitle(replaceVariables(title, interaction))
    .setDescription(replaceVariables(message, interaction))
    .setThumbnail(interaction.user.displayAvatarURL({ extension: "png", size: 256 }))
    .setImage(imageUrl)
    .setFooter({ text: "Configuración guardada · Vista previa" })
    .setTimestamp();
  await interaction.editReply({ embeds: [preview] });
}

export async function handleBirthdayInteraction(
  interaction: Interaction,
  developerUserId: string,
): Promise<boolean> {
  if (interaction.isModalSubmit() && interaction.customId.startsWith("birthday-embed:")) {
    await handleBirthdayEmbedModal(interaction, developerUserId);
    return true;
  }
  return false;
}
