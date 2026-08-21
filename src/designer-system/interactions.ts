import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  createCommission,
  getCommission,
  saveCommissionReview,
  setCommissionTicket,
  transitionCommission,
  type Commission,
  type CommissionStatus,
} from "../commissions/store.js";
import { getGuildSettings } from "../guild-settings/store.js";
import {
  claimDesignerAvailability,
  getApplication,
  getDesignerConfig,
  saveApplication,
  setApplicationStatus,
  setDesignerAvailability,
} from "./store.js";
import {
  deleteDesignerImage,
  uploadDesignerImage,
} from "../media/cloudinary.js";

const commissionDrafts = new Map<string, { work: string; createdAt: number }>();

function draftKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function stageCommission(guildId: string, userId: string, work: string): void {
  commissionDrafts.set(draftKey(guildId, userId), { work, createdAt: Date.now() });
}

function parseCustomId(customId: string): string[] {
  return customId.split(":");
}

const STATUS_NAMES: Record<CommissionStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  working: "Trabajando",
  delivered: "Entregada",
  completed: "Completada",
  cancelled: "Cancelada",
};

function buildCommissionEmbed(commission: Commission): EmbedBuilder {
  const terminal = commission.status === "completed" || commission.status === "cancelled";
  return new EmbedBuilder()
    .setColor(commission.status === "cancelled" ? 0xe74c3c : terminal ? 0x2ecc71 : 0x190c05)
    .setTitle(`Comisión #${commission.number} · ${STATUS_NAMES[commission.status]}`)
    .setDescription(commission.work)
    .addFields(
      { name: "Cliente", value: `<@${commission.clientId}>`, inline: true },
      { name: "Designer", value: `<@${commission.designerId}>`, inline: true },
      { name: "Estado", value: STATUS_NAMES[commission.status], inline: true },
    )
    .setFooter({ text: `ID ${commission.id}` })
    .setTimestamp(commission.updatedAt);
}

function buildCommissionControls(commission: Commission): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = [];
  if (commission.status === "pending") {
    buttons.push(new ButtonBuilder().setCustomId(`commission-action:accept:${commission.id}`).setLabel("Aceptar").setStyle(ButtonStyle.Success));
  } else if (commission.status === "accepted") {
    buttons.push(new ButtonBuilder().setCustomId(`commission-action:work:${commission.id}`).setLabel("Empezar trabajo").setStyle(ButtonStyle.Primary));
  } else if (commission.status === "working") {
    buttons.push(new ButtonBuilder().setCustomId(`commission-action:deliver:${commission.id}`).setLabel("Marcar entregada").setStyle(ButtonStyle.Success));
  } else if (commission.status === "delivered") {
    buttons.push(new ButtonBuilder().setCustomId(`commission-action:complete:${commission.id}`).setLabel("Completar").setStyle(ButtonStyle.Success));
  }
  if (!["completed", "cancelled"].includes(commission.status)) {
    buttons.push(new ButtonBuilder().setCustomId(`commission-action:cancel:${commission.id}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger));
  }
  return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}

function buildRatingControls(commission: Commission): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    [1, 2, 3, 4, 5].map((rating) =>
      new ButtonBuilder()
        .setCustomId(`commission-rate:${rating}:${commission.id}`)
        .setLabel(`${rating} ⭐`)
        .setStyle(rating >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
}

async function createCommissionTicket(
  interaction: ButtonInteraction,
  commission: Commission,
): Promise<string> {
  if (!interaction.inCachedGuild()) throw new Error("La comisión requiere un servidor.");
  const settings = await getGuildSettings(interaction.guild.id);
  const moderatorRoles = interaction.guild.roles.cache
    .filter((role) => !role.managed && role.id !== interaction.guild.id && role.permissions.any([
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ModerateMembers,
    ]))
    .first(80)
    .map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }));
  const channel = await interaction.guild.channels.create({
    name: `comision-${commission.number}`,
    type: ChannelType.GuildText,
    parent: settings.ticketCategoryId ?? null,
    topic: `Comisión #${commission.number} · Cliente ${commission.clientId} · Designer ${commission.designerId}`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: commission.clientId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: commission.designerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
      ...moderatorRoles,
    ],
    reason: `Ticket privado para la comisión #${commission.number}`,
  });
  await setCommissionTicket(commission.id, channel.id);
  await channel.send({
    content: `<@${commission.clientId}> <@${commission.designerId}> este es su ticket privado. El Designer debe aceptar la solicitud para comenzar.`,
    embeds: [buildCommissionEmbed({ ...commission, ticketChannelId: channel.id })],
    components: buildCommissionControls(commission),
  });
  return channel.id;
}

async function handleApplicationModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, guildId, userId] = parseCustomId(interaction.customId);
  if (!guildId || !userId || interaction.user.id !== userId || interaction.guildId !== guildId) {
    await interaction.reply({ content: "Esta solicitud no te pertenece.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const config = await getDesignerConfig(guildId);
  const guild = interaction.guild;
  if (!config || !guild) {
    await interaction.editReply("El sistema ya no está configurado.");
    return;
  }

  const channel = await guild.channels.fetch(config.reviewChannelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    await interaction.editReply("El canal de revisión configurado ya no está disponible.");
    return;
  }

  const introduction = interaction.fields.getTextInputValue("introduction").trim();
  const artStyle = interaction.fields.getTextInputValue("art-style").trim();
  const image = interaction.fields.getUploadedFiles("art-image", true).first();
  if (!image?.contentType?.startsWith("image/")) {
    await interaction.editReply("El archivo cargado debe ser una imagen válida.");
    return;
  }
  const previousApplication = await getApplication(guildId, userId);
  let cloudinaryImage;
  try {
    cloudinaryImage = await uploadDesignerImage(image.url, guildId, userId);
  } catch (error: unknown) {
    console.error("No se pudo subir la muestra a Cloudinary:", error);
    await interaction.editReply(
      "No pude guardar la imagen en Cloudinary. Intenta enviar la solicitud nuevamente.",
    );
    return;
  }
  const application = {
    guildId,
    userId,
    introduction,
    artStyle,
    imageUrl: cloudinaryImage.secureUrl,
    imagePublicId: cloudinaryImage.publicId,
    status: "pending" as const,
    submittedAt: new Date().toISOString(),
  };
  try {
    await saveApplication(application);
  } catch (error: unknown) {
    await deleteDesignerImage(cloudinaryImage.publicId).catch(() => undefined);
    throw error;
  }
  if (
    previousApplication?.imagePublicId &&
    previousApplication.imagePublicId !== cloudinaryImage.publicId
  ) {
    await deleteDesignerImage(previousApplication.imagePublicId).catch((error: unknown) => {
      console.error("No se pudo eliminar la muestra anterior de Cloudinary:", error);
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x190c05)
    .setTitle("Nueva solicitud para Designer")
    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(`Solicitud enviada por ${interaction.user}.`)
    .addFields(
      { name: "¿Quién es?", value: introduction },
      { name: "Estilo de dibujo", value: artStyle },
    )
    .setImage(cloudinaryImage.secureUrl)
    .setTimestamp();
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`designer-approve:${guildId}:${userId}`)
      .setLabel("Aprobar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`designer-reject:${guildId}:${userId}`)
      .setLabel("Rechazar")
      .setStyle(ButtonStyle.Danger),
  );
  await channel.send({ embeds: [embed], components: [buttons] });
  await interaction.editReply("Tu solicitud fue enviada al equipo de moderación.");
}

function canReview(interaction: ButtonInteraction): boolean {
  return (
    interaction.inCachedGuild() &&
    interaction.member.permissions.any([
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ModerateMembers,
    ])
  );
}

async function handleReview(interaction: ButtonInteraction): Promise<void> {
  if (!canReview(interaction) || !interaction.inCachedGuild()) {
    await interaction.reply({ content: "No tienes permiso para revisar solicitudes.", flags: MessageFlags.Ephemeral });
    return;
  }

  const [action, guildId, userId] = parseCustomId(interaction.customId);
  if (!guildId || !userId || guildId !== interaction.guild.id) return;
  const application = await getApplication(guildId, userId);
  if (!application || application.status !== "pending") {
    await interaction.reply({ content: "Esta solicitud ya fue revisada.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  const config = await getDesignerConfig(guildId);
  const applicant = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!config || !applicant) {
    await interaction.followUp({ content: "El usuario ya no está disponible en el servidor.", flags: MessageFlags.Ephemeral });
    return;
  }

  const approved = action === "designer-approve";
  if (approved) {
    await applicant.roles.add(config.roleId, `Solicitud aprobada por ${interaction.user.tag}`);
    await setDesignerAvailability(guildId, userId, true);
  }
  await setApplicationStatus(guildId, userId, approved ? "approved" : "rejected");

  const originalEmbed = interaction.message.embeds[0];
  const resultEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor(approved ? 0x2ecc71 : 0xe74c3c)
        .addFields({
          name: "Resultado",
          value: `${approved ? "Aprobada" : "Rechazada"} por ${interaction.user}`,
        })
    : new EmbedBuilder().setDescription(approved ? "Solicitud aprobada." : "Solicitud rechazada.");
  await interaction.editReply({ embeds: [resultEmbed], components: [] });

  const dmText = approved
    ? `¡Felicidades! Ahora te pueden elegir para una comisión en **${interaction.guild.name}**. Usa \`/status\` para indicar si estás disponible.`
    : `Tu solicitud para ser Designer en **${interaction.guild.name}** fue rechazada por el equipo de moderación.`;
  const dmSent = await applicant.send(dmText).then(() => true).catch(() => false);
  await interaction.followUp({
    content: `${approved ? "Solicitud aprobada" : "Solicitud rechazada"}.${dmSent ? " Se notificó por DM." : " Discord bloqueó el DM."}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCommissionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, guildId, requesterId] = parseCustomId(interaction.customId);
  if (!guildId || !requesterId || interaction.user.id !== requesterId || interaction.guildId !== guildId) {
    await interaction.reply({ content: "Esta selección no te pertenece.", flags: MessageFlags.Ephemeral });
    return;
  }
  const designerId = interaction.values[0];
  const draft = commissionDrafts.get(draftKey(guildId, requesterId));
  if (!designerId || !draft || Date.now() - draft.createdAt > 15 * 60_000) {
    await interaction.update({ content: "Esta selección caducó. Ejecuta `/comision` nuevamente.", components: [] });
    return;
  }

  const designer = await interaction.guild?.members.fetch(designerId).catch(() => null);
  if (!designer) {
    await interaction.update({ content: "Ese diseñador ya no está disponible.", components: [] });
    return;
  }
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`commission-confirm:${guildId}:${requesterId}:${designerId}`)
      .setLabel(`Contratar a ${designer.displayName}`.slice(0, 80))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`commission-cancel:${guildId}:${requesterId}`)
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary),
  );
  await interaction.update({
    content: `Has elegido a ${designer}.\n\n**Trabajo:** ${draft.work}\n\n¿Confirmas que quieres contactarlo para esta comisión?`,
    components: [buttons],
  });
}

async function handleCommissionButton(interaction: ButtonInteraction): Promise<void> {
  const [action, guildId, requesterId, designerId] = parseCustomId(interaction.customId);
  if (!guildId || !requesterId || requesterId !== interaction.user.id || guildId !== interaction.guildId) {
    await interaction.reply({ content: "Esta comisión no te pertenece.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === "commission-cancel") {
    commissionDrafts.delete(draftKey(guildId, requesterId));
    await interaction.update({ content: "Comisión cancelada.", components: [] });
    return;
  }

  const draft = commissionDrafts.get(draftKey(guildId, requesterId));
  const config = await getDesignerConfig(guildId);
  const designer = designerId
    ? await interaction.guild?.members.fetch(designerId).catch(() => null)
    : null;
  if (!draft || !config || !designer || !designer.roles.cache.has(config.roleId)) {
    await interaction.update({ content: "La comisión o el diseñador ya no están disponibles.", components: [] });
    return;
  }

  await interaction.deferUpdate();

  if (!(await claimDesignerAvailability(guildId, designer.id))) {
    await interaction.editReply({
      content: "Ese diseñador acaba de dejar de estar disponible. Ejecuta `/comision` para elegir otro.",
      components: [],
    });
    return;
  }

  const commission = await createCommission({
    guildId,
    clientId: requesterId,
    designerId: designer.id,
    work: draft.work,
  });
  let ticketChannelId: string;
  try {
    ticketChannelId = await createCommissionTicket(interaction, commission);
  } catch (error) {
    await transitionCommission(commission.id, "pending", "cancelled");
    await setDesignerAvailability(guildId, designer.id, true);
    throw error;
  }

  const dmSent = await designer
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x190c05)
          .setTitle("¡Te solicitaron una comisión!")
          .setDescription(
            `${interaction.user} quiere contratarte para una comisión. Revisa y acepta la solicitud en https://discord.com/channels/${guildId}/${ticketChannelId}.`,
          )
          .addFields(
            { name: "Cliente", value: `${interaction.user.tag} (${interaction.user.id})` },
            { name: "Trabajo solicitado", value: draft.work },
          )
          .setTimestamp(),
      ],
    })
    .then(() => true)
    .catch(() => false);

  commissionDrafts.delete(draftKey(guildId, requesterId));
  await interaction.editReply({
    content: `Comisión #${commission.number} creada con ${designer}. Continúen en <#${ticketChannelId}>.${dmSent ? " También se notificó al Designer por DM." : " Discord bloqueó su DM, pero tiene acceso al ticket."}`,
    components: [],
  });
}

async function lockCommissionTicket(interaction: ButtonInteraction, commission: Commission): Promise<void> {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;
  await Promise.all([
    channel.permissionOverwrites.edit(commission.clientId, { SendMessages: false }),
    channel.permissionOverwrites.edit(commission.designerId, { SendMessages: false }),
  ]).catch(() => undefined);
  await channel.setName(`cerrada-comision-${commission.number}`).catch(() => undefined);
}

async function handleCommissionAction(interaction: ButtonInteraction): Promise<void> {
  const [, action, commissionId] = parseCustomId(interaction.customId);
  if (!action || !commissionId || !interaction.inCachedGuild()) return;
  const commission = await getCommission(commissionId);
  if (!commission || commission.guildId !== interaction.guild.id) {
    await interaction.reply({ content: "Esta comisión ya no existe.", flags: MessageFlags.Ephemeral });
    return;
  }
  const isModerator = interaction.member.permissions.any([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ModerateMembers,
  ]);
  const isDesigner = interaction.user.id === commission.designerId;
  const isClient = interaction.user.id === commission.clientId;
  const transition = {
    accept: { from: ["pending"] as CommissionStatus[], to: "accepted" as CommissionStatus, allowed: isDesigner },
    work: { from: ["accepted"] as CommissionStatus[], to: "working" as CommissionStatus, allowed: isDesigner },
    deliver: { from: ["working"] as CommissionStatus[], to: "delivered" as CommissionStatus, allowed: isDesigner },
    complete: { from: ["delivered"] as CommissionStatus[], to: "completed" as CommissionStatus, allowed: isClient },
    cancel: { from: ["pending", "accepted", "working", "delivered"] as CommissionStatus[], to: "cancelled" as CommissionStatus, allowed: isClient || isDesigner || isModerator },
  }[action];
  if (!transition || !transition.allowed) {
    await interaction.reply({ content: "No te corresponde realizar esta acción en la comisión.", flags: MessageFlags.Ephemeral });
    return;
  }
  const updated = await transitionCommission(commission.id, transition.from, transition.to);
  if (!updated) {
    await interaction.reply({ content: "El estado ya cambió; actualiza el ticket.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update({ embeds: [buildCommissionEmbed(updated)], components: buildCommissionControls(updated) });
  if (updated.status === "completed" || updated.status === "cancelled") {
    await setDesignerAvailability(updated.guildId, updated.designerId, true);
    if (updated.status === "completed") {
      await interaction.followUp({
        content: `<@${updated.clientId}> califica el trabajo del Designer:`,
        components: [buildRatingControls(updated)],
      });
    }
    await lockCommissionTicket(interaction, updated);
  }
}

async function handleCommissionRating(interaction: ButtonInteraction): Promise<void> {
  const [, ratingText, commissionId] = parseCustomId(interaction.customId);
  const rating = Number(ratingText);
  const commission = commissionId ? await getCommission(commissionId) : null;
  if (!commission || commission.status !== "completed" || interaction.user.id !== commission.clientId || rating < 1 || rating > 5) {
    await interaction.reply({ content: "No puedes valorar esta comisión.", flags: MessageFlags.Ephemeral });
    return;
  }
  const saved = await saveCommissionReview(commission, rating);
  if (!saved) {
    await interaction.reply({ content: "Esta comisión ya tiene una valoración.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update({ content: `Valoración guardada: ${"⭐".repeat(rating)}. ¡Gracias!`, components: [] });
}

export async function handleDesignerInteraction(interaction: Interaction): Promise<boolean> {
  if (interaction.isModalSubmit() && interaction.customId.startsWith("designer-application:")) {
    await handleApplicationModal(interaction);
    return true;
  }
  if (
    interaction.isButton() &&
    (interaction.customId.startsWith("designer-approve:") ||
      interaction.customId.startsWith("designer-reject:"))
  ) {
    await handleReview(interaction);
    return true;
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("commission-select:")) {
    await handleCommissionSelect(interaction);
    return true;
  }
  if (
    interaction.isButton() &&
    (interaction.customId.startsWith("commission-confirm:") ||
      interaction.customId.startsWith("commission-cancel:"))
  ) {
    await handleCommissionButton(interaction);
    return true;
  }
  if (interaction.isButton() && interaction.customId.startsWith("commission-action:")) {
    await handleCommissionAction(interaction);
    return true;
  }
  if (interaction.isButton() && interaction.customId.startsWith("commission-rate:")) {
    await handleCommissionRating(interaction);
    return true;
  }
  return false;
}
