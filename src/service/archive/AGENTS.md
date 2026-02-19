# SERVICE ARCHIVE KNOWLEDGE BASE

## OVERVIEW
`src/service/archive/` handles message/reaction ingestion, normalization, and persistence for the archive runtime.

## STRUCTURE
```text
src/service/archive/
|- message.ts              # save/update/delete/bulk + guild backfill
\- reaction.ts             # add/remove/removeAll/removeEmoji normalization
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Message ingest path | `src/service/archive/message.ts` | Builds log context, writes MessageModel, runs embedding, optional Kafka |
| Reaction state merge | `src/service/archive/reaction.ts` | Normalizes stored reaction formats and upserts by emoji identifier |
| Guild backfill flow | `src/service/archive/message.ts` (`savePreviousMessages`) | Paginates channel history and bulk inserts |

## CONVENTIONS
- Use `getLogContext`/identity helpers from `src/utils/discord/` before persistence updates.
- Keep reaction normalization tolerant to array/map/object legacy shapes.
- Preserve non-fatal behavior for embedding/Kafka side paths (archive save still proceeds).

## ANTI-PATTERNS
- Do not bypass message identity filters when updating/deleting archived records.
- Do not change reaction identifier semantics (`emoji.identifier`) without model update review.
- Do not block archive ingest on optional downstream fan-out failures.
