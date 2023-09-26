export function parseIconSearchKeyword(text: string): string | null {
  if (!text.startsWith("~")) return null;
  const [iconCommand, ...restArgs] = text.split(" ");
  if (restArgs.includes(" ")) return null;

  // remove `~` prefix
  return iconCommand.slice(1);
}
