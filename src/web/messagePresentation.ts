import type { WebMessageImage } from './types';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const archivedData = (raw: unknown): Record<string, unknown> => {
  try {
    return record(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    /* Older raw records may not be JSON. */
    return {};
  }
};

export const archivedEditedTimestamp = (
  editedAt: unknown,
  raw: unknown
): string | undefined => {
  const data = archivedData(raw);
  for (const value of [
    editedAt,
    data.editedTimestamp,
    data.editedAt,
    data.edited_timestamp,
  ]) {
    if (
      !(value instanceof Date) &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    )
      continue;
    const date = new Date(value);
    if (Number.isFinite(date.getTime()) && date.getTime() > 0)
      return date.toISOString();
  }
  return undefined;
};

const attachmentUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
      /^\/(?:attachments|ephemeral-attachments)\/\d+\/\d+\/[^/]+$/.test(
        url.pathname
      )
      ? url.href
      : '';
  } catch {
    return '';
  }
};

export const archivedImages = (
  attachments: unknown,
  raw: unknown
): WebMessageImage[] => {
  // An explicit empty array means attachments were removed; do not resurrect
  // older data from raw or the search index in that case.
  const source = Array.isArray(attachments)
    ? attachments
    : archivedData(raw).attachments;
  if (!Array.isArray(source)) return [];
  return source
    .flatMap((value, index) => {
      const attachment = record(value);
      const name = String(
        attachment.name ?? attachment.filename ?? '첨부 이미지'
      ).slice(0, 200);
      const type = String(
        attachment.contentType ?? attachment.content_type ?? ''
      ).toLowerCase();
      const url =
        attachmentUrl(attachment.proxyURL ?? attachment.proxy_url) ||
        attachmentUrl(attachment.url);
      const isImage = type
        ? type.startsWith('image/')
        : /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:$|\?)/i.test(name) ||
          /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:$|\?)/i.test(url);
      if (!isImage) return [];
      return [
        {
          id: String(attachment.id ?? index),
          name,
          url,
          spoiler: attachment.spoiler === true || name.startsWith('SPOILER_'),
        },
      ];
    })
    .slice(0, 10);
};

export const archivedMessageContent = (
  message: {
    message?: unknown;
    raw?: unknown;
    editedAt?: unknown;
    EMBEDDING_INPUT?: unknown;
  },
  imageCount: number,
  fallback = ''
) => {
  const data = archivedData(message.raw);
  // Empty edited content is authoritative too; old indexed text must not
  // reappear after the author removes it or leaves only an attachment.
  const content =
    typeof message.message === 'string' ? message.message : data.content;
  if (typeof content === 'string') return content.trim().slice(0, 12000);
  if (imageCount || archivedEditedTimestamp(message.editedAt, message.raw))
    return '';
  const extracted =
    typeof message.EMBEDDING_INPUT === 'string'
      ? message.EMBEDDING_INPUT
      : fallback;
  return extracted
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n')
    .trim()
    .slice(0, 12000);
};

export const archivedMentions = (raw: unknown) => {
  const data = archivedData(raw);
  const mentions = record(data.mentions);
  const users: Record<string, string> = Object.create(null);
  const roles: Record<string, string> = Object.create(null);
  const entries = (value: unknown) =>
    Array.isArray(value) ? value : Object.values(record(value));
  for (const entry of [
    ...entries(Array.isArray(data.mentions) ? data.mentions : mentions.users),
    ...entries(mentions.members),
  ]) {
    const member = record(entry);
    const user = Object.keys(record(member.user)).length
      ? record(member.user)
      : member;
    const name = [
      member.nickname,
      member.nick,
      record(member.member).nick,
      member.displayName,
      user.global_name,
      user.globalName,
      user.username,
    ].find(value => typeof value === 'string' && value.length > 0);
    if (
      typeof user.id === 'string' &&
      /^\d+$/.test(user.id) &&
      typeof name === 'string'
    )
      users[user.id] = name.slice(0, 100);
  }
  for (const entry of entries(mentions.roles)) {
    const role = record(entry);
    if (
      typeof role.id === 'string' &&
      /^\d+$/.test(role.id) &&
      typeof role.name === 'string'
    )
      roles[role.id] = role.name.slice(0, 100);
  }
  // discord.js serializes mention collections as IDs, but also archives a
  // cleanContent snapshot. Recover names only when a line has one substitution
  // and its unchanged prefix/suffix match exactly; never guess ambiguous names.
  if (
    typeof data.content === 'string' &&
    typeof data.cleanContent === 'string'
  ) {
    const original = data.content.slice(0, 12000).split('\n');
    const cleaned = data.cleanContent.slice(0, 12000).split('\n');
    if (original.length === cleaned.length)
      original.forEach((line, index) => {
        const tokens = [
          ...line.matchAll(/<(?:@[!&]?|#)\d+>|<a?:\w+:\d+>|<\/[^>]+:\d+>/g),
        ];
        if (tokens.length !== 1) return;
        const token = tokens[0];
        const mention = token[0].match(/^<(@[!&]?)(\d+)>$/);
        if (!mention) return;
        const prefix = line.slice(0, token.index);
        const suffix = line.slice(token.index! + token[0].length);
        const clean = cleaned[index];
        if (!clean.startsWith(prefix) || !clean.endsWith(suffix)) return;
        const replacement = clean.slice(
          prefix.length,
          clean.length - suffix.length
        );
        if (
          !replacement.startsWith('@') ||
          replacement.length < 2 ||
          replacement.length > 101
        )
          return;
        (mention[1] === '@&' ? roles : users)[mention[2]] =
          replacement.slice(1);
      });
  }
  return { users, roles };
};

export const archivedAvatar = (
  raw: unknown,
  userId: string,
  guildId: string
) => {
  const data = archivedData(raw);
  const author = record(data.author);
  const member = record(data.member);
  if (/^\d+$/.test(userId) && /^\d+$/.test(guildId)) {
    if (typeof member.avatar === 'string' && /^[\w]+$/.test(member.avatar)) {
      return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${member.avatar}.webp?size=80`;
    }
    if (typeof author.avatar === 'string' && /^[\w]+$/.test(author.avatar)) {
      return `https://cdn.discordapp.com/avatars/${userId}/${author.avatar}.webp?size=80`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> BigInt(22)) % BigInt(6))}.png`;
  }
  return '';
};
