import fs from 'fs';
import sqlite3, { Database as Sqlite3Database } from 'better-sqlite3';
import logger from '../lib/logger';
import { config } from '../utils/config';

class Database {
  static _instance: Database = new Database();
  connection: Sqlite3Database;

  constructor() {
    if (typeof (config.SQLITE3_FILE) !== 'string' || fs.existsSync(config.SQLITE3_FILE) === false){ 
      logger.error('Invalid SQLITE3_FILE');
    }
    this.connection = sqlite3(config.SQLITE3_FILE);
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
