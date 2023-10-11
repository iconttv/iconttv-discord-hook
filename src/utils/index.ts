export function parseIconSearchKeyword(text: string): string | null {
  if (!text.startsWith("~")) return null;
  const [iconCommand, ...restArgs] = text.split(" ");
  if (restArgs.includes(" ")) return null;

  // remove `~` prefix
  return iconCommand.slice(1);
}

export async function sleep(sleepMs: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, sleepMs);
  });
}