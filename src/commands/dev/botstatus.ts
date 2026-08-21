import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getDatabase } from "../../database/mongodb.js";
import { getCloudinaryStatus } from "../../media/cloudinary.js";
import type { BotCommand } from "../types.js";

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export const botstatusCommand: BotCommand = {
  active: true,
  access: "dev",
  data: new SlashCommandBuilder().setName("botstatus").setDescription("Muestra el estado técnico de Nebu."),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const mongoStarted = performance.now();
    const [mongoResult, cloudinary] = await Promise.all([
      getDatabase().command({ ping: 1 })
        .then(() => ({ connected: true, latency: Math.round(performance.now() - mongoStarted) }))
        .catch(() => ({ connected: false, latency: Math.round(performance.now() - mongoStarted) })),
      getCloudinaryStatus(),
    ]);
    const mongo = mongoResult.connected;
    const memory = process.memoryUsage();
    const guilds = interaction.client.guilds.cache;
    const users = guilds.reduce((sum, guild) => sum + guild.memberCount, 0);
    const embed = new EmbedBuilder()
      .setColor(mongo && cloudinary ? 0x2ecc71 : 0xe74c3c)
      .setTitle("Estado técnico de Nebu")
      .addFields(
        { name: "Discord", value: `API: ${Math.round(interaction.client.ws.ping)} ms`, inline: true },
        { name: "MongoDB", value: `${mongo ? "Conectado" : "Error"} · ${mongoResult.latency} ms`, inline: true },
        { name: "Cloudinary", value: cloudinary ? "Conectado" : "Error", inline: true },
        { name: "Memoria", value: `RSS: ${(memory.rss / 1_048_576).toFixed(1)} MB\nHeap: ${(memory.heapUsed / 1_048_576).toFixed(1)} MB`, inline: true },
        { name: "Cobertura", value: `${guilds.size} servidor(es)\n${users.toLocaleString("es")} miembro(s)`, inline: true },
        { name: "Actividad", value: duration(process.uptime()), inline: true },
        { name: "Entorno", value: `Node ${process.version}\n${process.platform} ${process.arch}` },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
