type TelegramMessage = {
  chatId: string;
  text: string;
};

export async function sendTelegramMessage({ chatId, text }: TelegramMessage) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("Telegram is not configured. Add TELEGRAM_BOT_TOKEN to .env.local.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!response.ok) {
    throw new Error(`Telegram request failed (${response.status}).`);
  }
}

export async function sendTelegramDocument({ chatId, filename, content, caption }: { chatId: string; filename: string; content: string; caption?: string }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured. Add TELEGRAM_BOT_TOKEN to .env.local.");
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption);
  form.set("document", new Blob([content], { type: "application/json" }), filename);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Telegram document upload failed (${response.status}).`);
}
