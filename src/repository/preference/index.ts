import type { Database as Sqlite3Database } from 'better-sqlite3';
import {
  CREATE_TABLE,
  INSERT_ONE_PREF,
  SELECT_ONE_PREF,
  UPDATE_ONE_PREF,
} from './query';

export interface PreferenceData {
  guild_id: string;
  guild_name: string;
  allow_list: string[];
  updated_by_id: string;
  updated_by_nm: string;
  updated_dttm: Date;
}

export interface PreferenceRow {
  GUILD_ID: string;
  GUILD_NM: string;
  ALLOW_LIST: string[];
  UPDATED_BY_ID: string;
  UPDATED_BY_NM: string;
  UPDATED_DTTM: Date;
}

class Preference {
  database: Sqlite3Database;

  constructor(db: Sqlite3Database) {
    this.database = db;
    this.createTable();
  }

  createTable() {
    return this.database.prepare(CREATE_TABLE).run();
  }

  insertOne(pref: PreferenceData) {
    return this.database
      .prepare(INSERT_ONE_PREF)
      .bind(
        pref.guild_id,
        pref.guild_name,
        pref.allow_list,
        pref.updated_by_id,
        pref.updated_by_nm
      )
      .run();
  }

  updateOne(
    guild_id: string,
    allow_list: string[],
    updated_by_id: string,
    updated_by_nm: string
  ) {
    return this.database
      .prepare(UPDATE_ONE_PREF)
      .bind(allow_list, updated_by_id, updated_by_nm, guild_id)
      .run();
  }

  getOne(guild_id: string): PreferenceData | null {
    const row = this.database
      .prepare(SELECT_ONE_PREF)
      .bind(guild_id)
      .get() as PreferenceRow | null;

    if (!row) return null;
    return {
      guild_id: row.GUILD_ID,
      guild_name: row.GUILD_NM,
      allow_list: row.ALLOW_LIST,
      updated_by_id: row.UPDATED_BY_ID,
      updated_by_nm: row.UPDATED_BY_NM,
      updated_dttm: row.UPDATED_DTTM,
    };
  }
}

export default Preference;
