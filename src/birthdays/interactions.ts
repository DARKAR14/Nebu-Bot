import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
  type ModalSubmitInteraction,
} from "discord.js";
import { updateGuildSettings } from "../guild-settings/store.js";

function parseColor(value: string): number | null {
  const normalized = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return null;
  return Number.parseInt(normalized.slice(1), 16);
}

function validImageUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
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
  const imageUrl = interaction.fields.getTextInputValue("image").trim();
  const colorText = interaction.fields.getTextInputValue("color").trim();
  const color = parseColor(colorText);
  if (!validImageUrl(imageUrl)) {
    await interaction.reply({
      content: "La imagen debe ser una URL válida que comience con `https://` o `http://`.",
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

  await updateGuildSettings(interaction.guild.id, {
    birthdayEmbed: { title, message, imageUrl, color },
  });
  const preview = new EmbedBuilder()
    .setColor(color)
    .setTitle(replaceVariables(title, interaction))
    .setDescription(replaceVariables(message, interaction))
    .setThumbnail(interaction.user.displayAvatarURL({ extension: "png", size: 256 }))
    .setImage(imageUrl)
    .setFooter({ text: "Configuración guardada · Vista previa" })
    .setTimestamp();
  await interaction.reply({ embeds: [preview], flags: MessageFlags.Ephemeral });
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
