# SERVICE COMMANDS KNOWLEDGE BASE

## OVERVIEW
`src/service/commands/` contains dynamically discovered Discord slash commands. Detailed contracts, independent black-box comparisons, and editing checklist: [Discord and commands conventions](../../../docs/coding-conventions/discord-and-commands.md).

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Loader contract | `index.ts` (`readCommands`) | Cached tuple: registration JSON array and name-to-handler object |
| Dispatch | `src/controller/onCommandInteractionCreate.ts` | Uses `interaction.commandName`, not filename |
| Registration | `src/deploy-commands.ts` | Global purge/register; executes at import time, do not import for inspection |
| Question and summary | `question.ts`, `summarize.ts` | Input guards, server AI permission, defer/edit, provider error mapping |
| Settings | `setting.ts`, `src/controller/onModalSubmit.ts` | Guild-only moderator modal; matching custom/field IDs |
| Search and statistics | `search.ts`, `statistics.ts` | Guild/channel scopes; different keep defaults |
| Generated images | `imageGeneration.ts` | Ordered edit/reference images, shared profile embed and spoiler attachments |

## CURRENT COMMANDS
- `help.ts`: `/itvhelp`; `changelog.ts`: `/itvchangelog`; `whoami.ts`: `/whoami`.
- `setting.ts`: `/itvsetting`; `question.ts`: `/itvques`; `summarize.ts`: `/itvsumm`.
- `search.ts`: `/itvsc`; `statistics.ts`: `/itvstat`; `imageGeneration.ts`: `/itvimgen`.
- `_list.ts` defines `/itvlist` but is intentionally excluded by the loader.

## CONVENTIONS
- Export named `data` (builder with `name` and `toJSON`) and `execute` (`ChatInputCommandInteraction` to `Promise<void>`). An exported command object alone is not supported.
- Loader excludes index files, `_` prefixes, `.d.ts`, and non-TS/JS files. Keep command names unique and imports side-effect-free; do not rely on discovery order or hot reload.
- Reuse the existing loader for dispatch and deployment, rather than maintaining a second registry.
- Validate inputs and guild/channel context; reply then return on early rejection. Defer long-running work and use `editReply` afterward. Modal display is itself the initial response.
- Preserve each command's visibility policy: current commands use public replies/defer, not ephemeral. Scheduled deletion does not make a response private.
- `/itvques` accepts moderator OR everyone-enabled setting OR additional superuser, then separately checks server AI permission. Do not assume every AI command shares this gate.
- Reuse `replyMessagePerError` where applicable with `interaction.editReply.bind(interaction)`; review potentially sensitive error text before exposing it.
- Reuse Discord context/profile/attachment builders rather than redefining their schemas.

## RISKS, NOT PATTERNS TO COPY
- `summarize.ts` replies when both range options are present but currently lacks an immediate return.
- `imageGeneration.ts` currently calls `reply` on input-image failure after deferring; use the acknowledged response's edit path in new code.
- Some configuration checks precede defer and may consume the interaction response window.
- `search.ts` keep defaults false, `statistics.ts` defaults true; the latter's option description differs from its execution. Preserve or explicitly change behavior, not an assumed common default.
- Timed deletes must observe rejected Promises; `statistics.ts` catches deletion failures, unlike some older commands.
