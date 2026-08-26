import {
  ChannelType,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildBoostEmbed, DEFAULT_BOOST_EMBED } from "../../boosts/embed.js";
import { getGuildSettings, updateGuildSettings } from "../../guild-settings/store.js";
import type { BotCommand } from "../types.js";

export const boostCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName("boost")
    .setDescription("Configura y prueba los anuncios de Server Boost.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Elige el canal donde se anunciarán los boosts.")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal de anuncios de boosts.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("embed").setDescription("Crea o actualiza el diseño desde un formulario."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("test").setDescription("Muestra una vista previa privada del anuncio."),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const settings = await getGuildSettings(interaction.guild.id);
    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("canal", true);
      const botMember = interaction.guild.members.me;
      const permissions = botMember ? channel.permissionsFor(botMember) : null;
      if (!permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])) {
        await interaction.reply({
          content: "Necesito **View Channel**, **Send Messages** y **Embed Links** en ese canal.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await updateGuildSettings(interaction.guild.id, { boostChannelId: channel.id });
      await interaction.reply({
        content: `Los nuevos boosts se anunciarán en ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "test") {
      await interaction.reply({
        content: settings.boostChannelId
          ? `Vista previa. Los anuncios reales se enviarán en <#${settings.boostChannelId}>.`
          : "Vista previa. Aún debes configurar el canal con `/boost channel`.",
        embeds: [buildBoostEmbed(interaction.member, settings.boostEmbed)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const configured = settings.boostEmbed;
    const titleInput = new TextInputBuilder()
      .setCustomId("title")
      .setPlaceholder("🚀 ¡{usuario} ha impulsado el servidor!")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(256)
      .setRequired(true)
      .setValue(configured?.title ?? DEFAULT_BOOST_EMBED.title);
    const descriptionInput = new TextInputBuilder()
      .setCustomId("description")
      .setPlaceholder("Agradece a la persona que impulsó el servidor.")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setRequired(true)
      .setValue(configured?.description ?? DEFAULT_BOOST_EMBED.description);
    const imageUpload = new FileUploadBuilder()
      .setCustomId("image")
      .setMinValues(configured?.imageUrl ? 0 : 1)
      .setMaxValues(1)
      .setRequired(!configured?.imageUrl);

    const modal = new ModalBuilder()
      .setCustomId(`boost-embed:${interaction.guild.id}:${interaction.user.id}`)
      .setTitle(configured ? "Actualizar embed de boost" : "Crear embed de boost")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Título")
          .setDescription("Admite {usuario}, {mencion}, {servidor} y {boosts}.")
          .setTextInputComponent(titleInput),
        new LabelBuilder()
          .setLabel("Descripción")
          .setDescription("Mensaje principal para agradecer el boost.")
          .setTextInputComponent(descriptionInput),
        new LabelBuilder()
          .setLabel(configured?.imageUrl ? "Cambiar imagen (opcional)" : "Imagen del boost")
          .setDescription(
            configured?.imageUrl
              ? "Déjalo vacío para conservar la imagen actual."
              : "Selecciona una imagen desde tu dispositivo.",
          )
          .setFileUploadComponent(imageUpload),
      );
    await interaction.showModal(modal);
  },
};
