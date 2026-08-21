import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { BotCommand, CommandAccess, CommandContext } from "../types.js";

export const helpCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder().setName("help").setDescription("Muestra los comandos que puedes utilizar."),
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { commands } = await import("../index.js");
    const developer = interaction.user.id === context.config.developerUserId;
    const admin = interaction.inCachedGuild() && interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    const visible = commands.filter((command) => command.active && (command.access === "public" || developer || (command.access === "admin" && admin)));
    const groups: Array<[CommandAccess, string]> = [["public", "Públicos"], ["admin", "Moderación y administración"], ["dev", "Dueño"]];
    const embed = new EmbedBuilder().setColor(0x190c05).setTitle("Comandos de Nebu").setDescription("Solo aparecen las categorías que puedes ejecutar.");
    for (const [access, title] of groups) {
      const list = visible.filter((command) => command.access === access).map((command) => `\`/${command.data.name}\` — ${command.data.description}`).join("\n");
      if (list) embed.addFields({ name: title, value: list.slice(0, 1024) });
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
