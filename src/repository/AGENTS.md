# REPOSITORY KNOWLEDGE BASE

## OVERVIEW
`src/repository/` contains provider adapters and search composition for icon lookup.

## STRUCTURE
```text
src/repository/
|- icons/
|  |- index.ts             # abstract IconRepository contract
|  |- IconttvRepository.ts # remote icon provider
|  |- funzinnu/index.ts    # provider implementation
|  \- smalljuzi6974/index.ts
\- search/
   |- IconSearchEngine.ts  # provider orchestration and search
   \- _GuildMemberCache.ts # guild member cache helper
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Repository contract | `src/repository/icons/index.ts` | Base class requires `findOne` + `imagePathResolver` |
| Provider integration | `src/repository/icons/IconttvRepository.ts` | Remote fetch + cache expiry + lock pattern |
| Search orchestration | `src/repository/search/IconSearchEngine.ts` | Iterates providers and resolves first match |
| Member cache behavior | `src/repository/search/_GuildMemberCache.ts` | TTL-style in-memory cache cleanup |

## CONVENTIONS
- Add new icon providers under `src/repository/icons/` and register in `IconSearchEngine`.
- Keep provider implementations returning unresolved image paths; resolver handles final URL conversion.
- Preserve singleton/cache patterns already used in search/repository classes.

## ANTI-PATTERNS
- Do not call external provider APIs from controller files.
- Do not mix provider-specific URL rewrite logic into service layer.
- Do not bypass `IconSearchEngine` when feature flow requires multi-provider fallback.
