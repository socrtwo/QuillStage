/** Registers every command module. */
import './file';
import './edit';
import './fmt';
import './slide';
import './view';
import './arrange';
import.meta.glob(['./*.ts', '!./index.ts', '!./registry.ts'], { eager: true });
export { def, getCommand, allCommands, commandCount, searchCommands } from './registry';
