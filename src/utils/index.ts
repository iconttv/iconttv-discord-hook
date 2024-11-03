import safeJSONStringify from 'safe-json-stringify';

export function parseIconSearchKeyword(text: string): [string | null, string] {
  if (!text.startsWith('~')) return [null, text];
  const [iconCommand, ...restArgs] = text.split(' ');

  // remove `~` prefix
  return [iconCommand.slice(1), restArgs.join(' ')];
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

export function makeChunk<T>(arr: T[], n: number): Array<T[]> {
  const res = [];
  for (let i = 0; i < arr.length; i += n) {
    res.push(arr.slice(i, i + n));
  }
  return res;
}

export function replaceLaughs(text: string | null | undefined) {
  if (text === null || text === undefined) return;

  return text.replace(/ㅋ{3,}/g, '(웃음)');
}

export function unreplaceLaughs(text: string | null | undefined) {
  if (text === null || text === undefined) return;

  return text.replace('(웃음)', 'ㅋㅋㅋㅋㅋㅋㅋ');
}

export function formatDate(date: Date | null | undefined) {
  if (date === null || date === undefined) return '';

  function addLeadingZero(number: number) {
    return number < 10 ? '0' + number : number;
  }

  const month = addLeadingZero(date.getMonth() + 1);
  const day = addLeadingZero(date.getDate());
  const hours = addLeadingZero(date.getHours());
  const minutes = addLeadingZero(date.getMinutes());
  const seconds = addLeadingZero(date.getSeconds());

  return month + '/' + day + ' ' + hours + ':' + minutes + ':' + seconds;
}

export function jsonStringify(obj: object) {
  return safeJSONStringify(
    obj,
    (_, value) => (typeof value === 'bigint' ? value.toString() : value),
    2
  );
}
