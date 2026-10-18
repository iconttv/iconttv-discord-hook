# SERVICE ARCHIVE KNOWLEDGE BASE

## OVERVIEW
`src/service/archive/` persists messages, reaction snapshots, screen-sharing and camera sessions. Detailed observed contracts, known limitations and independent implementation comparisons: [archive and persistence conventions](../../../docs/coding-conventions/archive-and-persistence.md).

## WHERE TO LOOK
| Task | Location / symbol | Notes |
|------|-------------------|-------|
| Live ingest | `message.ts` / `saveMessage` | Context DTO, embedding before Mongo insert, optional Kafka |
| Updates and tombstones | `message.ts` / `updateMessage`, `deleteMessage`, `bulkDeleteMessage` | Compound identity; edits do not regenerate embeddings |
| History traversal | `message.ts` / `savePreviousMessagesAfterJoin`, `savePreviousMessages` | Newer gap then older history; BigInt Snowflake comparisons |
| Batch writes | `message.ts` / `saveMessagesBulk` | Chunks of five, allSettled, unordered compound-key upserts |
| Reaction snapshots | `reaction.ts` / `onMessageReactionChange` | Emoji identifier, structured senders/count, legacy normalization |
| Streaming/camera sessions | `voiceState.ts` / `onArchiveVoiceStateUpdate`, `reconcileGuildStreamingStates` | Independent `streaming` / `selfVideo` sessions |
| Shutdown tracking | `lifecycle.ts` | Only explicitly tracked promises are drained |

## CONVENTIONS
- Reuse `getLogContext` and compound `guildId + channelId + messageId` identity helpers from `src/utils/discord/`; stop when identity is unavailable.
- Preserve live/backfill differences: live is an unacknowledged insert; backfill is `$set` upsert. Do not describe either as a version-safe transaction.
- Keep deletion as a tombstone. Delete and reaction events do not upsert missing messages; message edits do.
- Normalize stored array/Map/object reactions before writing the current entry array; key by `emoji.identifier`, not display name.
- Keep artifact/embedding field names aligned with `MessageModel`; isolate logged embedding/Kafka failures from raw-message persistence.
- Preserve page boundaries from the full fetched page, even when a stop boundary filters saved messages. Check shutdown between pages/channels.
- Voice elapsed values are non-negative whole seconds; channel moves close the old session before opening the new one.

## LIMITATIONS, NOT RECOMMENDATIONS
- Message edits leave existing text/vector fields stale; no re-embedding or Kafka resend occurs.
- Batch `$set` can rewrite existing fields. Unique identity prevents duplicate documents, not stale content races.
- Reaction read/merge/write and voice lookup/create are not atomic concurrency guarantees; voice indexes are not unique.
- Ready/join reconciliation/backfill is tracked by the controller; normal message, reaction and voice event promises are not. Shutdown does not drain every write.
- Mongo writes do not directly populate Elasticsearch. Do not claim index synchronization or archive-wide Kafka publication.
