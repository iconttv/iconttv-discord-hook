interface AvatarSubject {
  senderId: string;
  avatarUrl: string;
}

type AvatarLookup = (
  guildId: string,
  userId: string,
  signal: AbortSignal
) => Promise<string | undefined>;

/** Profile enrichment is optional: failures must not prevent message searches. */
export class WebAvatarCache {
  private readonly entries = new Map<
    string,
    { url?: string; expiresAt: number }
  >();
  private readonly pending = new Map<string, Promise<string | undefined>>();

  constructor(
    private readonly lookup: AvatarLookup,
    private readonly options = {
      ttlMs: 60 * 60 * 1000,
      failureTtlMs: 60 * 1000,
      timeoutMs: 1800,
      maxEntries: 2000,
      maxPending: 100,
      now: Date.now,
    }
  ) {}

  async resolve<T extends AvatarSubject>(guildId: string, messages: T[]) {
    if (!/^\d{1,20}$/.test(guildId)) return messages;
    const needsProfile = (message: AvatarSubject) =>
      /^\d{1,20}$/.test(message.senderId) &&
      (!message.avatarUrl ||
        /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png$/.test(
          message.avatarUrl
        ));
    const users = [
      ...new Set(
        messages.filter(needsProfile).map(message => message.senderId)
      ),
    ];
    const urls = new Map(
      await Promise.all(
        users.map(
          async userId => [userId, await this.get(guildId, userId)] as const
        )
      )
    );
    return messages.map(message =>
      needsProfile(message) && urls.get(message.senderId)
        ? { ...message, avatarUrl: urls.get(message.senderId)! }
        : message
    );
  }

  private get(guildId: string, userId: string): Promise<string | undefined> {
    const key = `${guildId}:${userId}`;
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.options.now())
      return Promise.resolve(cached.url);
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= this.options.maxPending)
      return Promise.resolve(undefined);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<undefined>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, this.options.timeoutMs);
    });
    const request = Promise.race([
      Promise.resolve().then(() =>
        this.lookup(guildId, userId, controller.signal)
      ),
      timeout,
    ])
      .catch(() => undefined)
      .then(url => {
        this.entries.delete(key);
        this.entries.set(key, {
          url,
          expiresAt:
            this.options.now() +
            (url ? this.options.ttlMs : this.options.failureTtlMs),
        });
        while (this.entries.size > this.options.maxEntries)
          this.entries.delete(this.entries.keys().next().value!);
        return url;
      })
      .finally(() => {
        clearTimeout(timer);
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}
