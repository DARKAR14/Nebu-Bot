import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutoModerationRule,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";

const RULE_PREFIX = "[Nebu]";

function actions(channel: TextChannel) {
  return [
    { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: "Este mensaje fue bloqueado por la protección de la comunidad." } },
    { type: AutoModerationActionType.SendAlertMessage, metadata: { channel } },
  ];
}

async function replaceRule(
  interaction: ChatInputCommandInteraction<"cached">,
  name: string,
  create: () => Promise<AutoModerationRule>,
): Promise<void> {
  const rules = await interaction.guild.autoModerationRules.fetch();
  await Promise.all(rules.filter((rule) => rule.name === name).map((rule) => rule.delete(`Reconfigurado por ${interaction.user.tag}`)));
  await create();
}

export const automodCommand: BotCommand = {
  active: true,
  access: "admin",
  requiredPermission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configura la protección nativa contra spam de Discord.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurar")
        .setDescription("Activa anti-spam, anti-menciones y palabras bloqueadas.")
        .addChannelOption((option) => option.setName("canal_logs").setDescription("Alertas de AutoMod.").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption((option) => option.setName("max_menciones").setDescription("Máximo por mensaje (2-50).").setMinValue(2).setMaxValue(50))
        .addStringOption((option) => option.setName("palabras").setDescription("Palabras o frases separadas por comas (máx. 100).")),
    )
    .addSubcommand((subcommand) => subcommand.setName("estado").setDescription("Muestra las reglas administradas por Nebu."))
    .addSubcommand((subcommand) => subcommand.setName("desactivar").setDescription("Desactiva las reglas administradas por Nebu.")),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return void (await interaction.reply({ content: "Úsalo dentro del servidor.", flags: MessageFlags.Ephemeral }));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    const current = await interaction.guild.autoModerationRules.fetch();
    const managed = current.filter((rule) => rule.name.startsWith(RULE_PREFIX));
    if (subcommand === "estado") {
      const embed = new EmbedBuilder().setColor(0x190c05).setTitle("Estado de AutoMod").setDescription(
        managed.size
          ? managed.map((rule) => `• **${rule.name}** — ${rule.enabled ? "Activo" : "Inactivo"}`).join("\n")
          : "No hay reglas creadas por Nebu.",
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (subcommand === "desactivar") {
      await Promise.all(managed.map((rule) => rule.setEnabled(false, `Desactivado por ${interaction.user.tag}`)));
      await interaction.editReply(`Se desactivaron ${managed.size} regla(s) de Nebu.`);
      return;
    }
    const channel = interaction.options.getChannel("canal_logs", true);
    if (channel.type !== ChannelType.GuildText) return void (await interaction.editReply("Selecciona un canal de texto."));
    const reason = `Configurado por ${interaction.user.tag}`;
    await replaceRule(interaction, `${RULE_PREFIX} Anti-spam`, () => interaction.guild.autoModerationRules.create({
      name: `${RULE_PREFIX} Anti-spam`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions: actions(channel),
      enabled: true,
      reason,
    }));
    await replaceRule(interaction, `${RULE_PREFIX} Anti-menciones`, () => interaction.guild.autoModerationRules.create({
      name: `${RULE_PREFIX} Anti-menciones`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: interaction.options.getInteger("max_menciones") ?? 5, mentionRaidProtectionEnabled: true },
      actions: actions(channel),
      enabled: true,
      reason,
    }));
    const keywords = (interaction.options.getString("palabras") ?? "")
      .split(",").map((word) => word.trim().slice(0, 60)).filter(Boolean).slice(0, 100);
    if (keywords.length) {
      await replaceRule(interaction, `${RULE_PREFIX} Palabras`, () => interaction.guild.autoModerationRules.create({
        name: `${RULE_PREFIX} Palabras`,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: keywords },
        actions: actions(channel),
        enabled: true,
        reason,
      }));
    }
    await interaction.editReply(`AutoMod configurado. Las alertas llegarán a ${channel}.${keywords.length ? ` Se añadieron ${keywords.length} palabra(s).` : ""}`);
  },
};
