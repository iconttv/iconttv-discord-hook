# DATABASE KNOWLEDGE BASE

## OVERVIEW
`src/database/` owns Mongo connection setup and Mongoose schemas. SQLite failure caching lives separately in `src/service/embedding/failure_urls.ts`. Detailed field, writer and external-search contracts: [archive and persistence conventions](../../docs/coding-conventions/archive-and-persistence.md).

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Mongo bootstrap | `index.ts` / `createMongooseConnection` | Config-built auth URI, pool size 10, debug false |
| Schema/index map | `model/AGENTS.md` | Message, voice, AI logs, permissions, settings and caches |
| Message persistence | `model/MessageModel.ts` | Compound unique identity, tombstones, reactions, nullable vectors |
| Stream sessions | `model/VoiceStateModel.ts` | Streaming/camera discriminator; nonunique compound indexes |

## CONVENTIONS
- Keep schema/model/index definitions in `src/database/model/`; reuse existing models rather than creating ad hoc variants.
- Preserve message identity `guildId + channelId + messageId` across schema indexes, archive mutations and CLI updates.
- Read both the schema and its writers/consumers before changing field names, requiredness, defaults or indexes. Coordinate every affected caller and data migration; do not add compatibility aliases by default.
- Never log credentials, complete auth URIs or production payloads while inspecting connection behavior.
- Treat index declarations as desired schema metadata, not evidence that an operational database has installed them. Do not run index synchronization or touch production databases for documentation work.

## CURRENT LIMITATIONS
- `createMongooseConnection` calls `mongoose.connect` without returning or awaiting its promise. Awaiting this helper does not prove connection readiness. This is a limitation, not a recommended bootstrap pattern.
- Mongo persistence is not a transaction with Kafka delivery or Elasticsearch indexing; the archive writer does not create the external search index.
- Message edits currently leave text/vector derivatives stale, and shutdown drains only explicitly tracked archive work. Schema changes must not hide these service-level limits.

## RELATED GUIDANCE
- [Model knowledge base](model/AGENTS.md)
- [Archive service knowledge base](../service/archive/AGENTS.md)
- [Embedding knowledge base](../service/embedding/AGENTS.md)
