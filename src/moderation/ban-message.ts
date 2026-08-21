import { EmbedBuilder, type Guild, type User } from "discord.js";

interface BanMessageOptions {
  guild: Guild;
  target: User;
  moderator: User;
  reason: string;
  preview?: boolean;
}

export function buildBanMessage(options: BanMessageOptions) {
  const embed = new EmbedBuilder()
    .setColor(0x190c05)
    .setTitle(`Has sido baneado de ${options.guild.name}`)
    .setDescription(
      [
        `Hola, ${options.target}. Se ha restringido permanentemente tu acceso a **${options.guild.name}**.`,
        "",
        "**Motivo del baneo**",
        options.reason,
        "",
        "Esta decisión fue tomada por el equipo de moderación para proteger la convivencia y el bienestar de la comunidad.",
      ].join("\n"),
    )
    .addFields({
      name: "Moderador responsable",
      value: `${options.moderator.tag}`,
      inline: true,
    })
    .setThumbnail(options.guild.iconURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: options.preview
        ? "VISTA PREVIA · Notificación de baneo"
        : "Notificación oficial de moderación",
    });

  return { embeds: [embed] };
}
