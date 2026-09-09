export async function deliverReportParts(
  parts: string[], sentParts: number,
  send: (text: string) => Promise<void>, saveProgress: (count: number) => Promise<void>,
) {
  for (let index = sentParts; index < parts.length; index++) {
    await send(parts[index]);
    await saveProgress(index + 1);
  }
}
