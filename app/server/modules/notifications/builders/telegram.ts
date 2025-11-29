import type { NotificationConfig } from "~/schemas/notifications";

export function buildTelegramShoutrrrUrl(config: Extract<NotificationConfig, { type: "telegram" }>): string {
    // Shoutrrr format: telegram://bottoken@telegram?channels=chatid1,chatid2
    // config: { type: 'telegram', botToken: string, chatId: string }
    // Do NOT encode botToken or chatId; Shoutrrr expects raw values (colon, dash, etc.)
    return `telegram://${config.botToken}@telegram?channels=${config.chatId}`;
}
