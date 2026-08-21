import type { BotCommand } from "../types.js";
import { comisionCommand } from "./comision.js";
import { createCommand } from "./create.js";
import { statusCommand } from "./status.js";
import { portfolioCommand } from "./portfolio.js";
import { portfolioEditCommand } from "./portfolio-edit.js";
import { avatarCommand } from "./avatar.js";
import { helpCommand } from "./help.js";
import { hablarCommand } from "./hablar.js";
import { serverinfoCommand } from "./serverinfo.js";
import { userinfoCommand } from "./userinfo.js";

// Agrega aquí comandos disponibles para todos los miembros.
export const publicCommands: readonly BotCommand[] = [
  createCommand,
  comisionCommand,
  statusCommand,
  portfolioCommand,
  portfolioEditCommand,
  userinfoCommand,
  serverinfoCommand,
  avatarCommand,
  helpCommand,
  hablarCommand,
];
