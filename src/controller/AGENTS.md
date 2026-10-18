# CONTROLLER KNOWLEDGE BASE

## OVERVIEW
`src/controller/` routes Discord events to services. Main interactive behavior and archive persistence have separate registrations. Detailed contracts and pitfalls: [Discord and commands conventions](../../docs/coding-conventions/discord-and-commands.md).

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Main event wiring | `index.ts` (`registerEvents`) | Ready/debug/warn/error hooks, message create/update, chat-command/modal split |
| Archive event wiring | `archive/index.ts` (`registerEventsArchive`) | Message lifecycle, reactions, voice state, join backfill/reconciliation; archive lifecycle tracking |
| Slash dispatch | `onCommandInteractionCreate.ts` | `readCommands()[1]` lookup by commandName; missing handler returns silently |
| Message pipeline | `onMessageCreate.ts` | Reads settings, starts icon replacement, conditionally starts small-image conversion |
| Modal handling | `onModalSubmit.ts` | `setting` custom ID; parses two boolean inputs, persists, replies, schedules deletion |

## CONVENTIONS
- Keep controllers thin: event/type guard, routing, service invocation. Persistence and feature processing belong in services.
- Reuse `src/service/commands/index.ts` for slash dispatch and registration; do not introduce another command registry.
- Preserve the main/archive runtime boundary; do not attach main message transformations to archive registration.
- Keep modal custom ID and field IDs aligned with `src/service/commands/setting.ts`. Only nonempty `1` becomes true; empty input becomes undefined in current parsing.
- Model moderator checks, guild-only context, and submission permissions explicitly. The settings command checks moderator permissions, but the current modal handler does not repeat that check.
- Await/return work whose failure must reach a surrounding catch. Keep logger/webhook event labels meaningful and handle errors on deliberately detached work.

## CURRENT RISKS
- Main interaction listeners call async command/modal handlers without await. Their try/catch does not capture all async failures.
- Command dispatch starts a handler chain without returning/awaiting it; its catch is followed by a success-log then, so failure may still produce a success log.
- `onMessageCreate` starts both feature services without awaiting them. MessageUpdate also enters this path.
- The client enables partial messages, but main transformation functions take `Message` and do not explicitly fetch partials here. Bot-message and sendable-channel guards are not established by the current controller.
- Scheduled modal-reply deletion does not currently catch rejection. These are hazards to fix deliberately, not conventions to duplicate.
