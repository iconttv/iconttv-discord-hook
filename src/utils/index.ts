export function parseIconSearchKeyword(text: string): string | null {
  if (!text.startsWith('~')) return null;
  const [iconCommand, ...restArgs] = text.split(' ');
  if (restArgs.includes(' ')) return null;

  // remove `~` prefix
  return iconCommand.slice(1);
}

export async function sleep(sleepMs: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, sleepMs);
  });
}

export async function acquireLock(
  isLocked: () => boolean,
  maxWaitMs: number
): Promise<void> {
  if (!isLocked()) return;

  const interval = 10;
  let waitMs = 0;
  while (isLocked() && waitMs < maxWaitMs) {
    await sleep(interval);
    waitMs += interval;
  }

  if (waitMs >= maxWaitMs) {
    throw new Error('Lock Acquirement Failed!');
  }
}

export function* makeChunks<T>(arr: T[], n: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n);
  }
}

export function replaceLaughs(text: string) {
  return text.replace(/ㅋ{3,}/g, '(웃음)');
}
