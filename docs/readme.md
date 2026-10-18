
## [초대코드](https://discord.com/api/oauth2/authorize?client_id=1149360270188220536&permissions=274878016512&scope=bot)

---


## 코드 작업 가이드

- [프로젝트 작업 지침](../AGENTS.md)
- [상세 코딩 컨벤션과 독립 LLM 비교 절차](coding-conventions/README.md)

아래 실행 예시는 개발자용 운영 절차입니다. 자동화 에이전트는 루트 AGENTS의 실행 금지를 우선 따르며, 도움말도 import 시 SQLite·로그를 초기화하므로 격리된 디렉터리에서 검증합니다.

# 개발 관련


## 환경설정 파일

`NODE_ENV=prod`이면 `./.env`, 그 밖에는 `./.env.dev`를 사용합니다. 실제 키 목록은 [`.env.example`](../.env.example), 해석 규칙은 [`src/config.ts`](../src/config.ts)를 참고하세요. `SQLITE3_FILE` 설정은 현재 사용하지 않으며, 실패 URL 저장소는 작업 디렉터리의 `./database/failure_urls.db`입니다.

## 실행 순서

1. `/` 명령어 등록

```bash
yarn cmd-dev
```

2. 봇 실행
```bash
yarn dev
```


## [개발자용 초대코드](https://discord.com/api/oauth2/authorize?client_id=1177228340961230939&permissions=274878016512&scope=bot)
