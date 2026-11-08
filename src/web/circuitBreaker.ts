export class BackendUnavailable extends Error {}
export class SemanticSearchUnavailable extends Error {}

// One breaker per web process. A single probe closes the circuit after cooldown.
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probing = false;
  constructor(
    private threshold = 3,
    private cooldown = 30000,
    private now = Date.now
  ) {}

  async run<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    let isProbe = false;
    if (this.openedAt !== null) {
      if (this.now() - this.openedAt < this.cooldown || this.probing)
        return fallback();
      this.probing = true;
      isProbe = true;
    }
    try {
      const result = await primary();
      this.failures = 0;
      this.openedAt = null;
      return result;
    } catch (error) {
      if (!(error instanceof BackendUnavailable)) throw error;
      this.failures++;
      if (this.failures >= this.threshold) this.openedAt = this.now();
      return await fallback();
    } finally {
      if (isProbe) this.probing = false;
    }
  }
}
