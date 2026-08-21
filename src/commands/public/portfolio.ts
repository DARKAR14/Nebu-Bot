import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getDesignerRating } from "../../commissions/store.js";
import { getApplication, getDesignerConfig, getDesignerProfile } from "../../designer-system/store.js";
import type { BotCommand } from "../types.js";

export const portfolioCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("portfolio")
    .setDescription("Muestra el portfolio público de un Designer.")
    .addUserOption((option) => option.setName("designer").setDescription("Designer cuyo perfil quieres consultar.")),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    await interaction.deferReply();
    const user = interaction.options.getUser("designer") ?? interaction.user;
    const config = await getDesignerConfig(interaction.guild.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const application = await getApplication(interaction.guild.id, user.id);
    if (!config || !member?.roles.cache.has(config.roleId) || application?.status !== "approved") {
      await interaction.editReply("Ese usuario no tiene un perfil de Designer aprobado.");
      return;
    }
    const [profile, rating] = await Promise.all([
      getDesignerProfile(interaction.guild.id, user.id),
      getDesignerRating(interaction.guild.id, user.id),
    ]);
    const images = [application.imageUrl, ...(profile?.samples.map((sample) => sample.imageUrl) ?? [])];
    const embed = new EmbedBuilder()
      .setColor(0x190c05)
      .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL() })
      .setTitle("Portfolio de Designer")
      .setDescription(application.introduction)
      .addFields(
        { name: "Estilo", value: application.artStyle },
        { name: "Especialidades", value: profile?.specialties || "Aún no especificadas." },
        { name: "Precios", value: profile?.prices || "Consultar directamente con el Designer." },
        { name: "Calificación", value: rating.count ? `${"⭐".repeat(Math.round(rating.average))} ${rating.average.toFixed(1)}/5 (${rating.count})` : "Sin valoraciones todavía." },
        { name: "Muestras adicionales", value: images.slice(1).map((url, index) => `[Muestra ${index + 2}](${url})`).join(" · ") || "Sin muestras adicionales." },
      )
      .setImage(images[0]!)
      .setTimestamp(profile?.updatedAt ?? new Date(application.submittedAt));
    await interaction.editReply({ embeds: [embed] });
  },
};
