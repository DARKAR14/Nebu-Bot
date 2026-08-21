import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getApplication, getDesignerConfig, getDesignerProfile, saveDesignerProfile } from "../../designer-system/store.js";
import { deleteDesignerImage, uploadPortfolioImage } from "../../media/cloudinary.js";
import type { BotCommand } from "../types.js";

export const portfolioEditCommand: BotCommand = {
  active: true,
  access: "public",
  data: new SlashCommandBuilder()
    .setName("portfolio-edit")
    .setDescription("Actualiza tu información y añade una muestra al portfolio.")
    .addStringOption((option) => option.setName("especialidades").setDescription("Ej.: anime, logos, pixel art.").setRequired(true).setMaxLength(500))
    .addStringOption((option) => option.setName("precios").setDescription("Rangos o forma de cotización.").setRequired(true).setMaxLength(500))
    .addAttachmentOption((option) => option.setName("muestra").setDescription("Imagen opcional; se conservan las últimas cinco.")),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [config, application] = await Promise.all([
      getDesignerConfig(interaction.guild.id),
      getApplication(interaction.guild.id, interaction.user.id),
    ]);
    if (!config || application?.status !== "approved" || !interaction.member.roles.cache.has(config.roleId)) {
      await interaction.editReply("Solo los Designers aprobados pueden editar un portfolio.");
      return;
    }
    const attachment = interaction.options.getAttachment("muestra");
    if (attachment && !attachment.contentType?.startsWith("image/")) {
      await interaction.editReply("La muestra debe ser una imagen.");
      return;
    }
    const previous = await getDesignerProfile(interaction.guild.id, interaction.user.id);
    const uploaded = attachment ? await uploadPortfolioImage(attachment.url, interaction.guild.id, interaction.user.id) : null;
    try {
      const removed = await saveDesignerProfile(
        interaction.guild.id,
        interaction.user.id,
        interaction.options.getString("especialidades", true).trim(),
        interaction.options.getString("precios", true).trim(),
        uploaded ? { imageUrl: uploaded.secureUrl, imagePublicId: uploaded.publicId } : undefined,
      );
      await Promise.all(removed.map((sample) => deleteDesignerImage(sample.imagePublicId).catch(() => undefined)));
    } catch (error) {
      if (uploaded) await deleteDesignerImage(uploaded.publicId).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`Portfolio actualizado${uploaded ? ` con una nueva muestra (${Math.min((previous?.samples.length ?? 0) + 1, 5)}/5)` : ""}.`);
  },
};
