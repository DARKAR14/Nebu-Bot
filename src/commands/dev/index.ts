import type { BotCommand } from "../types.js";
import { testCommand } from "./test.js";
import { backupCommand } from "./backup.js";
import { botstatusCommand } from "./botstatus.js";

// Agrega aquí comandos exclusivos del dueño/desarrollador.
export const devCommands: readonly BotCommand[] = [testCommand, botstatusCommand, backupCommand];
