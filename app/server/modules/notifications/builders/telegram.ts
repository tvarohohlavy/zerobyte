import type { NotificationConfig } from "~/schemas/notifications";

export function buildTelegramShoutrrrUrl(config: Extract<NotificationConfig, { type: "telegram" }>): string {
    // Shoutrrr format: telegram://bottoken@telegram?channels=chatid1,chatid2
    // config: { type: 'telegram', botToken: string, chatId: string }
    return `telegram://${encodeURIComponent(config.botToken)}@telegram?channels=${encodeURIComponent(config.chatId)}`;
}
