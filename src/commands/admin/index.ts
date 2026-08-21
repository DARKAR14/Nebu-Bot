import type { BotCommand } from "../types.js";
import { banCommand } from "./ban.js";
import { automodCommand } from "./automod.js";
import { clearCommand } from "./clear.js";
import { casoCommand } from "./caso.js";
import { configurarCommand } from "./configurar.js";
import { designerCommand } from "./designer.js";
import { invitarCommand } from "./invitar.js";
import { kickCommand } from "./kick.js";
import { muteTextCommand } from "./mute-text.js";
import { muteVoiceCommand } from "./mute-voice.js";
import { presenceCommand } from "./presence.js";
import { unbanCommand } from "./unban.js";
import { unmuteTextCommand } from "./unmute-text.js";
import { unmuteVoiceCommand } from "./unmute-voice.js";
import { warnCommand } from "./warn.js";

export const adminCommands: readonly BotCommand[] = [
  configurarCommand,
  automodCommand,
  casoCommand,
  designerCommand,
  presenceCommand,
  invitarCommand,
  muteTextCommand,
  muteVoiceCommand,
  banCommand,
  kickCommand,
  warnCommand,
  unbanCommand,
  unmuteTextCommand,
  unmuteVoiceCommand,
  clearCommand,
];
