export const getWebHealthOrigin = (port = '3011', override?: string) =>
  override?.trim() || `http://iconttv-discord-web:${port || '3011'}`;

interface HealthProbeOptions {
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
  fetch?: typeof fetch;
}

export class WebHealthProbe {
  private cached?: { healthy: boolean; expiresAt: number };
  private pending?: Promise<boolean>;

  constructor(
    private readonly origin: string,
    private readonly options: HealthProbeOptions = {}
  ) {}

  check(): Promise<boolean> {
    const now = this.options.now ?? Date.now;
    if (this.cached && now() < this.cached.expiresAt)
      return Promise.resolve(this.cached.healthy);
    if (this.pending) return this.pending;
    this.pending = this.request()
      .then(healthy => {
        this.cached = {
          healthy,
          expiresAt: now() + (this.options.ttlMs ?? 5000),
        };
        return healthy;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async request(): Promise<boolean> {
    try {
      const url = new URL('/health', this.origin);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return false;
      const response = await (this.options.fetch ?? fetch)(url, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 1500),
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        return false;
      }
      const body = await response.json();
      return body?.status === 'ok' && body?.service === 'iconttv-discord-web';
    } catch {
      return false;
    }
  }
}
