import WebSessionModel, {
  WEB_SESSION_RETENTION_SECONDS,
} from '../database/model/WebSessionModel';
import logger from '../lib/logger';

let retentionSetup: Promise<void> | undefined;

const updateRetentionIndex = async () => {
  try {
    await WebSessionModel.collection.createIndex(
      { expiresAt: 1 },
      {
        name: 'expiresAt_1',
        expireAfterSeconds: WEB_SESSION_RETENTION_SECONDS,
      }
    );
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;
    if (code !== 85 && code !== 86) throw error;
    const db = WebSessionModel.db.db;
    if (!db) throw new Error('MongoDB is not connected.');
    await db.command({
      collMod: WebSessionModel.collection.name,
      index: {
        name: 'expiresAt_1',
        expireAfterSeconds: WEB_SESSION_RETENTION_SECONDS,
      },
    });
  }
};

export const ensureWebSessionRetention = (): Promise<void> => {
  if (!retentionSetup) {
    retentionSetup = updateRetentionIndex().catch(error => {
      retentionSetup = undefined;
      throw error;
    });
  }
  return retentionSetup;
};

export const scheduleWebSessionCleanup = () => {
  void ensureWebSessionRetention().catch(() => {
    logger.warn(
      'Web session retention index setup failed. Check MongoDB index permissions; an existing TTL may still delete sessions earlier.'
    );
  });
  const cutoff = new Date(Date.now() - WEB_SESSION_RETENTION_SECONDS * 1000);
  // Best effort on every issued link, independent of TTL installation. Neither
  // cleanup nor index maintenance delays token delivery or fails the command.
  void Promise.resolve()
    .then(() =>
      WebSessionModel.deleteMany({
        expiresAt: { $lt: cutoff },
      })
        .maxTimeMS(5000)
        .exec()
    )
    .catch(() => {
      logger.warn(
        'Expired web session cleanup failed; a later link issuance will retry.'
      );
    });
};
