# CONTROLLER KNOWLEDGE BASE

## OVERVIEW
`src/controller/` is the Discord event-routing layer; it delegates business work to service modules.

## STRUCTURE
```text
src/controller/
|- index.ts                # main runtime event registration
|- onMessageCreate.ts      # message create/update routing to services
|- onCommandInteractionCreate.ts
|- onModalSubmit.ts
\- archive/index.ts        # archive runtime event registration
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Main event wiring | `src/controller/index.ts` | Ready/debug/warn/error hooks + interaction split |
| Archive event wiring | `src/controller/archive/index.ts` | Message/reaction archive listeners |
| Slash interaction dispatch | `src/controller/onCommandInteractionCreate.ts` | Looks up handler from command cache |
| Message pipeline entry | `src/controller/onMessageCreate.ts` | Calls icon replacement + image embed flow |
| Modal handling | `src/controller/onModalSubmit.ts` | Setting update modal logic |

## CONVENTIONS
- Keep controllers thin: route + guard + service call.
- Wrap Discord listener failures with logger/webhook paths from existing patterns.
- Keep runtime-specific registration split (`index.ts` vs `archive/index.ts`).

## ANTI-PATTERNS
- Do not add long-running processing directly inside `client.on(...)` handlers.
- Do not bypass `src/service/commands/index.ts` for slash command dispatch.
- Do not add persistence logic directly in controller files.

## NOTES
- If routing behavior changes, update both main and archive controller boundaries when applicable.
