import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { setDesignerConfig } from "../../designer-system/store.js";
import type { BotCommand } from "../types.js";

export const designerCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageRoles,
  data: new SlashCommandBuilder()
    .setName("designer")
    .setDescription("Configura el rol Designer y el canal de solicitudes.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName("canal")
        .setDescription("Canal donde se revisarán las solicitudes.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "Este comando solo se puede usar dentro del servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reviewChannel =
      interaction.options.getChannel("canal") ?? interaction.channel;

    if (
      !reviewChannel?.isTextBased() ||
      !reviewChannel.isSendable() ||
      reviewChannel.isThread()
    ) {
      await interaction.editReply("Selecciona un canal de texto donde el bot pueda enviar mensajes.");
      return;
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.editReply("Necesito el permiso `Manage Roles` para crear y asignar el rol Designer.");
      return;
    }

    const channelPermissions = reviewChannel.permissionsFor(botMember);
    if (
      !channelPermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])
    ) {
      await interaction.editReply(
        "Necesito `View Channel`, `Send Messages` y `Embed Links` en el canal de solicitudes.",
      );
      return;
    }

    let role = interaction.guild.roles.cache.find(
      (candidate) => candidate.name.toLowerCase() === "designer",
    );

    role ??= await interaction.guild.roles.create({
      name: "Designer",
      color: 0x190c05,
      reason: `Sistema de diseñadores configurado por ${interaction.user.tag}`,
    });

    if (role.managed || role.position >= botMember.roles.highest.position) {
      await interaction.editReply(
        `No puedo asignar ${role}. Mueve el rol del bot por encima de Designer en la jerarquía.`,
      );
      return;
    }

    await setDesignerConfig(interaction.guild.id, {
      roleId: role.id,
      reviewChannelId: reviewChannel.id,
    });

    await interaction.editReply(
      `Sistema configurado. Rol: ${role}. Solicitudes: ${reviewChannel as GuildTextBasedChannel}.`,
    );
  },
};
