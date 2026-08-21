import {
  ChannelType,
  EmbedBuilder,
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
import {
  deleteBirthday,
  isValidBirthday,
  listBirthdaysForMonth,
  saveBirthday,
} from "../../birthdays/store.js";
import { getGuildSettings, updateGuildSettings } from "../../guild-settings/store.js";
import type { BotCommand, CommandContext } from "../types.js";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function currentMonthInBogota(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      month: "numeric",
    }).format(new Date()),
  );
}

function isBirthdayAdmin(
  interaction: ChatInputCommandInteraction<"cached">,
  context: CommandContext,
): boolean {
  return (
    interaction.user.id === context.config.developerUserId ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

export const cumpleanosCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("cumpleanos")
    .setDescription("Registra cumpleaños y consulta quién celebra este mes.")
    .addSubcommand((subcommand) =>
      subcommand.setName("lista").setDescription("Muestra los cumpleaños del mes actual."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("crear")
        .setDescription("Registra o actualiza tu cumpleaños.")
        .addIntegerOption((option) =>
          option.setName("mes").setDescription("Número del mes (1-12).").setMinValue(1).setMaxValue(12).setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("dia").setDescription("Día del mes.").setMinValue(1).setMaxValue(31).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("eliminar").setDescription("Elimina tu cumpleaños registrado."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Configura el canal de anuncios (solo administradores).")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal donde se publicarán los cumpleaños.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embed")
        .setDescription("Abre el formulario del anuncio (solo administradores)."),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "lista") {
      const month = currentMonthInBogota();
      const birthdays = await listBirthdaysForMonth(interaction.guild.id, month);
      const monthName = MONTH_NAMES[month - 1] ?? `mes ${month}`;
      if (birthdays.length === 0) {
        await interaction.reply({
          content: `No hay cumpleaños registrados para **${monthName}**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const lines = birthdays.map((birthday) => `🎂 **${birthday.day} de ${monthName}** — <@${birthday.userId}>`);
      let description = "";
      for (const line of lines) {
        if (`${description}${line}\n`.length > 3_900) break;
        description += `${line}\n`;
      }
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x190c05)
          .setTitle(`Cumpleaños de ${monthName}`)
          .setDescription(description.trim())
          .setFooter({ text: `${birthdays.length} cumpleaños registrado${birthdays.length === 1 ? "" : "s"}` })
          .setTimestamp()],
      });
      return;
    }

    if (subcommand === "crear") {
      const month = interaction.options.getInteger("mes", true);
      const day = interaction.options.getInteger("dia", true);
      if (!isValidBirthday(month, day)) {
        await interaction.reply({
          content: "Ese día no existe en el mes indicado. Revisa la fecha.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await saveBirthday(interaction.guild.id, interaction.user.id, month, day);
      await interaction.reply({
        content: `Guardé tu cumpleaños: **${day} de ${MONTH_NAMES[month - 1]}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "eliminar") {
      const removed = await deleteBirthday(interaction.guild.id, interaction.user.id);
      await interaction.reply({
        content: removed
          ? "Eliminé tu cumpleaños del servidor."
          : "No tenías un cumpleaños registrado en este servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isBirthdayAdmin(interaction, context)) {
      await interaction.reply({
        content: "Solo los administradores pueden configurar los anuncios de cumpleaños.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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
      await updateGuildSettings(interaction.guild.id, { birthdayChannelId: channel.id });
      await interaction.reply({
        content: `Los cumpleaños se anunciarán en ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    const configured = settings.birthdayEmbed;
    const titleInput = new TextInputBuilder()
      .setCustomId("title")
      .setPlaceholder("🎂 ¡Feliz cumpleaños, {usuario}!")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(256)
      .setRequired(true);
    const messageInput = new TextInputBuilder()
      .setCustomId("message")
      .setPlaceholder("Hoy celebramos a {mencion}...")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setRequired(true);
    const imageUpload = new FileUploadBuilder()
      .setCustomId("image")
      .setMinValues(configured?.imageUrl ? 0 : 1)
      .setMaxValues(1)
      .setRequired(!configured?.imageUrl);
    const colorInput = new TextInputBuilder()
      .setCustomId("color")
      .setPlaceholder("#190c05")
      .setStyle(TextInputStyle.Short)
      .setMinLength(7)
      .setMaxLength(7)
      .setRequired(true);

    if (configured) {
      titleInput.setValue(configured.title);
      messageInput.setValue(configured.message);
      colorInput.setValue(`#${configured.color.toString(16).padStart(6, "0")}`);
    } else {
      titleInput.setValue("🎂 ¡Feliz cumpleaños, {usuario}!");
      messageInput.setValue(
        "Hoy celebramos a {mencion}. ¡Que este nuevo viaje alrededor del Sol venga lleno de momentos increíbles!",
      );
      colorInput.setValue("#190c05");
    }

    const modal = new ModalBuilder()
      .setCustomId(`birthday-embed:${interaction.guild.id}:${interaction.user.id}`)
      .setTitle(configured ? "Actualizar embed de cumpleaños" : "Crear embed de cumpleaños")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Título")
          .setDescription("Puedes usar {usuario}, {mencion} y {servidor}.")
          .setTextInputComponent(titleInput),
        new LabelBuilder()
          .setLabel("Mensaje")
          .setDescription("Texto principal que aparecerá en el anuncio.")
          .setTextInputComponent(messageInput),
        new LabelBuilder()
          .setLabel(configured?.imageUrl ? "Cambiar imagen (opcional)" : "Imagen del cumpleaños")
          .setDescription(
            configured?.imageUrl
              ? "Deja este campo vacío para conservar la imagen actual."
              : "Sube una imagen que aparecerá debajo del mensaje.",
          )
          .setFileUploadComponent(imageUpload),
        new LabelBuilder()
          .setLabel("Color hexadecimal")
          .setDescription("Usa el formato #RRGGBB, por ejemplo #190c05.")
          .setTextInputComponent(colorInput),
      );
    await interaction.showModal(modal);
  },
};
