# UTILS LLM KNOWLEDGE BASE

## OVERVIEW
`src/utils/llm/` is the LLM integration boundary for summarize/question flows and schema-constrained outputs.

## STRUCTURE
```text
src/utils/llm/
|- index.ts                # summarize/question facade exports
|- openrouter.ts           # provider call orchestration and prompt loading
\- types.ts                # OpenAI JSON schema output contracts
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Summarize/question entrypoints | `src/utils/llm/index.ts` | Thin facade used by services |
| OpenRouter call logic | `src/utils/llm/openrouter.ts` | Model selection, prompt fetch, logRequest hooks |
| Output schema contracts | `src/utils/llm/types.ts` | `SummarizeOutputSchemaOpenai`, `questionOutputSchemaOpenai` |
| Prompt policy source | `static/prompt-question.txt`, `static/prompt-summarization.txt` | Runtime-fetched prompt templates |

## CONVENTIONS
- Keep output schema enforcement via `response_format: json_schema`.
- Keep prompt files externalized under `static/` and fetched by branch-aware `GITHUB_BASEURL`.
- Preserve provider-specific safety/body configuration branches already in use.

## ANTI-PATTERNS
- Do not return free-form output when schema contracts are expected.
- Do not inline long prompt text directly into TS files.
- Do not remove prompt constraints around anonymization and wording preservation.
