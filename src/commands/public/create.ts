import {
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getApplication, getDesignerConfig } from "../../designer-system/store.js";
import type { BotCommand } from "../types.js";

export const createCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("create")
    .setDescription("Crea una solicitud para un sistema del servidor.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("designer")
        .setDescription("Solicita acceso al rol Designer."),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await getDesignerConfig(interaction.guild.id);
    if (!config) {
      await interaction.reply({
        content: "El sistema de diseñadores todavía no ha sido configurado por un administrador.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.member.roles.cache.has(config.roleId)) {
      await interaction.reply({ content: "Ya tienes el rol Designer.", flags: MessageFlags.Ephemeral });
      return;
    }

    const previous = await getApplication(interaction.guild.id, interaction.user.id);
    if (previous?.status === "pending") {
      await interaction.reply({ content: "Ya tienes una solicitud pendiente de revisión.", flags: MessageFlags.Ephemeral });
      return;
    }

    const introduction = new TextInputBuilder()
      .setCustomId("introduction")
      .setPlaceholder("Cuéntanos sobre ti y tu experiencia...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(20)
      .setMaxLength(1000);
    const artStyle = new TextInputBuilder()
      .setCustomId("art-style")
      .setPlaceholder("Anime, realismo, pixel art, ilustración...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(500);
    const imageUpload = new FileUploadBuilder()
      .setCustomId("art-image")
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`designer-application:${interaction.guild.id}:${interaction.user.id}`)
      .setTitle("Solicitud para Designer")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("¿Quién eres?")
          .setDescription("Cuéntanos brevemente sobre ti y tu experiencia.")
          .setTextInputComponent(introduction),
        new LabelBuilder()
          .setLabel("¿Cuál es tu estilo de dibujo?")
          .setTextInputComponent(artStyle),
        new LabelBuilder()
          .setLabel("Muestra de tu trabajo")
          .setDescription("Sube una imagen representativa de tu arte.")
          .setFileUploadComponent(imageUpload),
      );

    await interaction.showModal(modal);
  },
};
