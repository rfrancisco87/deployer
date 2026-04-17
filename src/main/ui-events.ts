import { EventEmitter } from "events";

/**
 * Shared app-level events for cross-module signalling without circular imports.
 *
 * - `tray:ack`    — the user has seen the latest deployment result; tray
 *                   should drop its colored dot until the next transition.
 */
export const uiEvents = new EventEmitter();
