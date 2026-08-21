import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  deleteBirthday,
  isValidBirthday,
  listBirthdaysForMonth,
  saveBirthday,
} from "../../birthdays/store.js";
import { updateGuildSettings } from "../../guild-settings/store.js";
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

function parseColor(value: string | null): number | null {
  const normalized = (value ?? "#190c05").trim();
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
        .setDescription("Configura el anuncio de cumpleaños (solo administradores).")
        .addStringOption((option) =>
          option.setName("titulo").setDescription("Título; admite {usuario}, {mencion} y {servidor}.").setMaxLength(256).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("mensaje").setDescription("Mensaje; admite {usuario}, {mencion} y {servidor}.").setMaxLength(2000).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("imagen").setDescription("URL HTTPS de la imagen grande.").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("color").setDescription("Color hexadecimal, por ejemplo #190c05."),
        ),
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

    const title = interaction.options.getString("titulo", true);
    const message = interaction.options.getString("mensaje", true);
    const imageUrl = interaction.options.getString("imagen", true);
    const color = parseColor(interaction.options.getString("color"));
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
      .setTitle(title.replaceAll("{usuario}", interaction.member.displayName).replaceAll("{mencion}", interaction.user.toString()).replaceAll("{servidor}", interaction.guild.name))
      .setDescription(message.replaceAll("{usuario}", interaction.member.displayName).replaceAll("{mencion}", interaction.user.toString()).replaceAll("{servidor}", interaction.guild.name))
      .setThumbnail(interaction.user.displayAvatarURL({ extension: "png", size: 256 }))
      .setImage(imageUrl)
      .setFooter({ text: "Vista previa del cumpleaños" });
    await interaction.reply({ embeds: [preview], flags: MessageFlags.Ephemeral });
  },
};
