import sqlite3, { Database as Sqlite3Database } from 'better-sqlite3';

class Database {
  static _instance: Database = new Database();
  connection: Sqlite3Database;

  constructor() {
    this.connection = sqlite3(process.env.SQLITE3_FILE);
    this.connection.pragma('journal_mode = WAL');
  }

  static getInstance() {
    if (!this._instance) {
      this._instance = new Database();
    }
    return this._instance;
  }
}

export default Database;
