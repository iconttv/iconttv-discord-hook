# REPOSITORY KNOWLEDGE BASE

## OVERVIEW
`src/repository/` contains provider adapters and search composition for icon lookup.

Detailed conventions and independent implementation comparisons: [core/adapters](../../docs/coding-conventions/core-and-adapters.md). This directory handles icon lookup, not all persistence in the package.

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
- Add new icon providers under `src/repository/icons/` and register in `IconSearchEngine._repositories`. Current order is smalljuzi6974 then funzinnu; a provider filter does not reorder them.
- Keep `findOne(searchKeyword): Promise<Icon | null>` returning unresolved image paths; synchronous `imagePathResolver(imagePath): string` performs final URL conversion. Engine results use `Icon.isRemoteImage`, not a new wrapper DTO.
- Reuse existing provider-level caches. IconttvRepository caches for five minutes; the search engine's result cache is commented out. Empty provider filters mean all providers; empty catalogs are currently refetched.
- Preserve case-insensitive exact keyword matching and copyIcon result copying. Fuzzy matching, reordered providers, new cache semantics, or replacement concurrency mechanisms are behavior changes, not documentation fixes.
- Singleton/flag-lock patterns describe existing code, not a guarantee of complete race safety. Do not copy placeholder string throws or known lock limitations into new implementations.

## ANTI-PATTERNS
- Do not call external provider APIs from controller files.
- Do not mix provider-specific URL rewrite logic into service layer.
- Do not bypass `IconSearchEngine` when feature flow requires multi-provider fallback.
