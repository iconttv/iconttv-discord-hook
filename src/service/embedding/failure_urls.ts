import SqliteDatabase from 'better-sqlite3';
import path from 'path';

interface FailureUrlStoreOptions {
  dbPath?: string;
}

class FailureUrlStore {
  private db: SqliteDatabase.Database;
  private selectStmt: SqliteDatabase.Statement;
  private insertStmt: SqliteDatabase.Statement;
  // private buffer: Map<string, number>; // url -> insertedAt(ms)
  // private flushTimer?: NodeJS.Timeout | undefined;
  private opts: Required<FailureUrlStoreOptions>;
  private closed = false;

  constructor(options: FailureUrlStoreOptions = {}) {
    this.opts = {
      dbPath: options.dbPath ?? path.resolve(__dirname, 'failure_urls.db'),
    };

    this.db = new SqliteDatabase(this.opts.dbPath);
    // this.buffer = new Map();

    // DB 초기화
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      [
        "CREATE TABLE IF NOT EXISTS failure_urls (url TEXT PRIMARY KEY, createdAt TEXT not null DEFAULT (datetime('now', 'localtime')));",
        'CREATE INDEX IF NOT EXISTS failure_urls_idx ON failure_urls (url);',
      ].join('\n')
    );

    // Prepared statements
    this.selectStmt = this.db.prepare(
      'SELECT url FROM failure_urls WHERE url = @url'
    );
    this.insertStmt = this.db.prepare(
      'INSERT OR IGNORE INTO failure_urls (url) VALUES (@url)'
    );
  }

  public insertFailedUrl(url: string) {
    if (this.closed) throw new Error('FailureUrlStore is closed');
    this.insertStmt.run({ url });
  }

  public isFailedUrl(url: string): boolean {
    if (this.closed) throw new Error('FailureUrlStore is closed');
    const row = this.selectStmt.get({ url });
    return row !== undefined;
  }

  public close() {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }
}

export const databaseSqlite = new FailureUrlStore();
