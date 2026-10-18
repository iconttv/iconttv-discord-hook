# DATABASE MODEL KNOWLEDGE BASE

## OVERVIEW
`src/database/model/` is the source of truth for Mongo fields, defaults, collections and declared indexes. See [archive and persistence conventions](../../../docs/coding-conventions/archive-and-persistence.md) for exact DTO mappings, independent examples and limitations.

## WHERE TO LOOK
| Model file | Contract |
|------------|----------|
| `MessageModel.ts` | `discordMessages`; unique guild/channel/message identity; raw payload, tombstones, structured reactions and text/vector derivatives |
| `VoiceStateModel.ts` | `voiceStates`; independent `streaming` / `selfVideo` sessions; two nonunique compound lookup indexes |
| `AiRequestModel.ts` | Required guild/channel, provider/model/params/response, createdAt; nonunique guild/channel index |
| `MessageSummarizationModel.ts` | Guild/channel, hours/count, summary snapshots; no explicit index |
| `GuildPermissionModel.ts` | Guild-unique permission document; level comment contract `0`, `3`, `10` |
| `DiscordSettingModel.ts` | Guild-unique feature settings; resize/question flags default false, additional superusers default empty |
| `GuildUserNameModel.ts` | Guild/user unique name mapping with ordinary and anonymous names |

## CONVENTIONS
- Declare indexes beside schemas before model compilation, preserving existing exports and explicit collection names where present.
- Keep message identity fields as strings and preserve the compound unique index; `_id = messageId` is not the current model contract.
- Reaction entries contain emoji metadata, sender records and count. Nested schemas disable `_id`; align changes with `normalizeStoredReactions` and `onMessageReactionChange` in `src/service/archive/reaction.ts`.
- Artifact derivatives are `Map<string, string>` fields; embedding metadata uses uppercase `EMBEDDING_*`. `EMBEDDING_STATUS` is Boolean with null default, not a string enum.
- Distinguish Discord `createdAt`, edit/delete timestamps and ingestion `_CREATED_AT`. Do not add implicit timestamps assumptions to schemas that manage fields explicitly.
- Voice identity includes streamType; elapsed values are whole seconds. Its lookup indexes do not enforce one active session.
- Check archive/CLI writers and external search consumers before changing fields or uniqueness. Mongo uppercase derivative names differ from Elasticsearch's lowercase fields.

## ANTI-PATTERNS
- Do not convert soft deletion into physical deletion or drop raw artifacts as an embedding shortcut.
- Do not treat defaults, nonunique indexes or lookup-before-create as concurrency/durability guarantees.
- Do not claim declared indexes are installed in production, or run model imports/index synchronization to verify documentation.
- Do not recommend stale edit embeddings or absent connection-await behavior as conventions; these are documented limitations outside the schema contract.
