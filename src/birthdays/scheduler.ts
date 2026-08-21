import { EmbedBuilder, type Client, type GuildMember } from "discord.js";
import { getGuildSettings } from "../guild-settings/store.js";
import {
  claimBirthdayAnnouncement,
  listBirthdaysForDay,
  releaseBirthdayAnnouncement,
} from "./store.js";

const TIME_ZONE = "America/Bogota";
const CHECK_INTERVAL_MS = 60_000;
const DEFAULT_COLOR = 0x190c05;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
  dateKey: string;
}

function currentBogotaDate(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function replaceVariables(value: string, member: GuildMember): string {
  return value
    .replaceAll("{usuario}", member.displayName)
    .replaceAll("{mencion}", `<@${member.id}>`)
    .replaceAll("{servidor}", member.guild.name);
}

async function runBirthdayCheck(client: Client): Promise<void> {
  const today = currentBogotaDate();
  const includeLeapDay = today.month === 2 && today.day === 28 && !isLeapYear(today.year);

  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id).catch(() => null);
    if (!settings?.birthdayChannelId) continue;
    const channel = await guild.channels.fetch(settings.birthdayChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) continue;
    const birthdays = await listBirthdaysForDay(
      guild.id,
      today.month,
      today.day,
      includeLeapDay,
    );

    for (const birthday of birthdays) {
      const member = await guild.members.fetch(birthday.userId).catch(() => null);
      if (!member) continue;
      const claimed = await claimBirthdayAnnouncement(guild.id, member.id, today.dateKey);
      if (!claimed) continue;
      const configured = settings.birthdayEmbed;
      const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256 });
      const imageUrl = configured?.imageUrl || member.user.bannerURL({ size: 1024 }) || guild.bannerURL({ size: 1024 }) || avatarUrl;
      const embed = new EmbedBuilder()
        .setColor(configured?.color ?? DEFAULT_COLOR)
        .setTitle(replaceVariables(configured?.title ?? "🎂 ¡Feliz cumpleaños, {usuario}!", member))
        .setDescription(
          replaceVariables(
            configured?.message ??
              "Hoy celebramos a {mencion}. ¡Que este nuevo viaje alrededor del Sol venga lleno de momentos increíbles!",
            member,
          ),
        )
        .setThumbnail(avatarUrl)
        .setImage(imageUrl)
        .setFooter({ text: `Cumpleaños en ${guild.name}` })
        .setTimestamp();

      try {
        await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
      } catch (error: unknown) {
        await releaseBirthdayAnnouncement(guild.id, member.id, today.dateKey).catch(() => undefined);
        console.error(
          `[CUMPLEAÑOS] No se pudo anunciar a ${member.user.tag} en ${guild.name}:`,
          error,
        );
      }
    }
  }
}

export function startBirthdayScheduler(client: Client): NodeJS.Timeout {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runBirthdayCheck(client);
    } catch (error: unknown) {
      console.error("[CUMPLEAÑOS] Falló la revisión diaria:", error);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
