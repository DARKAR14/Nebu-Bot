import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  time,
  TimestampStyles,
  type Guild,
  type User,
} from "discord.js";

interface InviteMessageOptions {
  guild: Guild;
  inviter: User;
  target: User;
  expiresAt: Date;
  inviteUrl?: string;
  preview?: boolean;
}

export function buildInviteMessage(options: InviteMessageOptions) {
  const embed = new EmbedBuilder()
    .setColor(0x190c05)
    .setTitle(`Una invitación especial a ${options.guild.name}`)
    .setDescription(
      [
        `${options.inviter} te ha invitado a **${options.guild.name}**.`,
        "",
        "Esta invitación te llega porque eres una persona **chill** y tu presencia dejó una buena impresión al jugar con nuestra comunidad. Nos gustó compartir contigo y queremos que formes parte de este espacio.",
        "",
        "Ven a pasarla bien, conocer gente y disfrutar nuevas partidas con nosotros. ✨",
        "",
        "Este enlace admite **un solo uso** y Discord solo permitirá aceptarlo desde tu cuenta. No es transferible.",
        `Caduca ${time(options.expiresAt, TimestampStyles.RelativeTime)}.`,
      ].join("\n"),
    )
    .setThumbnail(options.guild.iconURL({ size: 256 }))
    .setFooter({
      text: options.preview
        ? `VISTA PREVIA · Invitación personal para ${options.target.username}`
        : `Invitación personal para ${options.target.username}`,
    });

  const button = options.inviteUrl
    ? new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Unirme al servidor")
        .setURL(options.inviteUrl)
    : new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setCustomId("invite-preview-disabled")
        .setLabel("Unirme al servidor")
        .setDisabled(true);

  const components = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return { embeds: [embed], components: [components] };
}
