type TelegramMessage = {
  chatId: string;
  text: string;
};

type TelegramError = { description?: string };

const TELEGRAM_TEXT_LIMIT = 4096;
const RETRY_DELAYS_MS = [0, 500, 1500];

function splitTelegramText(text: string) {
  if (text.length <= TELEGRAM_TEXT_LIMIT) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length) {
    if (remaining.length <= TELEGRAM_TEXT_LIMIT) {
      chunks.push(remaining);
      break;
    }
    const window = remaining.slice(0, TELEGRAM_TEXT_LIMIT);
    const splitAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const end = splitAt > TELEGRAM_TEXT_LIMIT / 2 ? splitAt : TELEGRAM_TEXT_LIMIT;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  return chunks;
}

async function telegramError(response: Response) {
  const body = await response.json().catch(() => ({})) as TelegramError;
  return body.description || `HTTP ${response.status}`;
}

async function postTelegram(method: string, body: BodyInit, headers?: HeadersInit) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured. Add TELEGRAM_BOT_TOKEN to .env.local.");

  let lastError = "Unknown Telegram error";
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers, body });
      if (response.ok) return;
      lastError = await telegramError(response);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network request failed";
    }
  }
  throw new Error(`Telegram ${method} failed: ${lastError}`);
}

export async function sendTelegramMessage({ chatId, text }: TelegramMessage) {
  for (const chunk of splitTelegramText(text)) {
    await postTelegram("sendMessage", JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "HTML" }), { "Content-Type": "application/json" });
  }
}

export async function sendTelegramDocument({ chatId, filename, content, caption }: { chatId: string; filename: string; content: string; caption?: string }) {
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption);
  form.set("document", new Blob([content], { type: "application/json" }), filename);
  await postTelegram("sendDocument", form);
}
