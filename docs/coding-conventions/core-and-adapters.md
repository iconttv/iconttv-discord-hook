# 공통 코드·런타임·아이콘 어댑터 컨벤션

[컨벤션 인덱스](README.md)

## 1. 조사한 기능과 경계

이 패키지는 HTTP 서버가 아니라 Discord Gateway 이벤트를 처리하는 여러 프로세스다. 봇, 아카이브 워커, CLI, 명령 배포 도구의 진입점을 분리하고 같은 서비스·유틸리티·모델을 공유한다.

| 책임 | 현재 구현과 계약 |
|---|---|
| 봇 시작 | [`src/index.ts`](../../src/index.ts): `createMongooseConnection`, `registerEvents`, `client.login` |
| 아카이브 시작·종료 | [`src/archive.ts`](../../src/archive.ts): 종료 요청, 추적 작업 대기, Discord 파기, Mongo 해제, Kafka producer 해제 |
| 운영 명령 | [`src/cli.ts`](../../src/cli.ts): `llm-question`, `embedding`, `backfill` |
| 설정 | [`src/config.ts`](../../src/config.ts): `Config`와 named export `config` |
| 공통 로거 | [`src/lib/logger.ts`](../../src/lib/logger.ts): default export `logger`, named export `channel_log_message` |
| 아이콘 데이터 | [`src/models/index.ts`](../../src/models/index.ts): `Icon`, `IconttvIcon` |
| 카탈로그 어댑터 | [`src/repository/icons/IconttvRepository.ts`](../../src/repository/icons/IconttvRepository.ts): 원격 목록·provider별 캐시·키워드 매칭 |
| provider 선택 | [`src/repository/search/IconSearchEngine.ts`](../../src/repository/search/IconSearchEngine.ts): 순서대로 검색, URL 해석, 결과 복사 |

아래에서 **설정 규칙**은 설정 파일이 정한 값, **현재 계약**은 호출자가 실제로 기대하는 형식, **현재 제약**은 관찰된 위험이다. 제약을 따라야 하는 새 규칙으로 해석하지 않는다.

## 2. 코드 표기와 도구 설정

### 2.1 기계적으로 확인 가능한 설정 규칙

근거: [`.prettierrc.cjs`](../../.prettierrc.cjs), [`.eslintrc.cjs`](../../.eslintrc.cjs), [`tsconfig.json`](../../tsconfig.json), [`package.json`](../../package.json).

- Node `24.x`, Yarn `4.12.0`을 사용한다. 의존성 변경은 Yarn으로 하고 `yarn.lock`을 손으로 편집하지 않는다.
- TypeScript `strict: true`, `module: CommonJS`, `target: es6`, `esModuleInterop: true`다. 선언 파일과 소스맵을 생성하고 주석을 제거한다.
- 들여쓰기 2칸, 공백 사용, 문자열 작은따옴표, 세미콜론 사용, print width 80, trailing comma `es5`, 한 인자 화살표 함수의 괄호 생략이 포매터 설정이다.
- ESLint는 `eslint:recommended`와 TypeScript recommended를 사용하며 `no-console`은 경고다. 기존 `eslint-disable`을 모든 새 코드에 복사하지 않는다.
- 포매터 설정은 현재 모든 파일이 완벽하게 포맷되었다는 증거가 아니다. 기능 변경과 무관한 파일 전체 포맷은 섞지 않는다.
- `lint:format`은 실제로 `yarn lint --fix`다. 별도의 Prettier 실행 스크립트가 아니다. `.prettierrc.cjs`는 `parser: 'typescript'`를 고정하므로 Markdown 검사에 그대로 적용하지 않는다.
- 빌드 스크립트는 `tsc`이며 `tsconfig.json`을 쓴다. `tsconfig.build.json`이 자동 적용된다고 가정하지 않는다.

### 2.2 관찰된 명명·모듈 패턴

- 서비스 함수는 `getGuildSetting`, `summarizeLastMessages`처럼 camelCase named export를 주로 쓴다. 파일명은 `settingService.ts`, `messageService.ts` 형식이다.
- 모델·클래스는 `MessageModel`, `IconttvRepository`, `IconSearchEngine`처럼 PascalCase다.
- 함수·interface·class, default/named export가 혼재한다. 모든 파일을 한 형태로 통일하는 새 규칙보다 편집 대상의 공개 계약을 유지한다.
- import는 상대 경로를 사용한다. 경로 alias 설정은 없다. `./index` 명시 여부와 type-only import는 혼재하므로 전역 강제 규칙으로 만들지 않는다.
- 타입은 해당 모듈 가까이에 두는 경우와 `models/`, `type/` 공유 타입이 함께 있다. 새 공유 타입은 실제 여러 소비자가 있을 때만 분리한다.
- 상수는 `EXPIRE_TIME`, `CACHE_CLEAR_CHECK_TIME_MS` 같은 대문자 이름, 시간은 밀리초 숫자식을 사용한다.
- 사용자 응답과 명령 설명은 한국어 중심이다. 로그와 식별자는 영어도 사용한다.

```ts
// 현재 provider 확장 패턴. 아래는 기존 구현의 형태다.
import { IconttvRepository } from '../IconttvRepository';

export class IconFunzinnuRepository extends IconttvRepository {
  _streamerName = 'funzinnu';
}
```

## 3. 계층·의존성 규칙

- `controller/`는 Discord 이벤트를 해석하고 서비스로 넘긴다. 새 외부 provider HTTP 호출이나 DB 모델 정의를 controller에 넣지 않는다.
- `service/`는 기능 흐름을 조합한다. Discord interaction의 응답 수명주기는 명령 파일이 맡는다. 다만 기존 `iconService`처럼 메시지 게시·삭제가 기능 자체인 서비스도 있으므로 “서비스는 절대 Discord I/O를 하지 않는다”는 규칙은 현재 코드와 맞지 않는다.
- `repository/`는 아이콘 provider와 검색 조합 계층이다. 이 레포의 모든 Mongo 접근이 repository를 거친다는 가정은 틀리다. 서비스와 유틸리티가 Mongoose 모델을 직접 사용한다.
- `database/model/`에 영속 스키마와 인덱스를 둔다. 관련 세부 계약은 [아카이브·영속성](archive-and-persistence.md)을 따른다.
- `utils/`는 문맥·payload·메시지 정규화·공급자 요청을 공유한다. 유틸리티가 모두 순수 함수인 것은 아니다.
- 런타임 환경 접근은 `config`를 통해 한다. controller별 `dotenv.config()` 또는 서로 다른 env 이름을 추가하지 않는다.
- 범용 DI 컨테이너, HTTP router, 공통 base service를 새 컨벤션으로 도입하지 않는다. 기존 구조에 없는 재설계는 기능 수정과 구분한다.

## 4. 환경·실행 계약

### 4.1 실제 환경 이름

`process.env.NODE_ENV === 'prod'`인 경우에만 `.env`를 읽고 `config.ENV`는 `prod`가 된다. 그 밖의 값이나 미설정은 `.env.dev`와 `dev`다. `production`을 넣으면 개발 경로로 분기한다.

설정 파일이 있으면 dotenv를 호출하며 기본 override 동작을 바꾸지 않는다. 현재 `Config`의 `!`는 컴파일 타임 단언일 뿐 필수값 검증기가 아니다. [`src/global.d.ts`](../../src/global.d.ts)에는 오래된 공급자 키도 남아 있으므로 새 설정의 기준은 `src/config.ts`와 [`.env.example`](../../.env.example)이다.

| 영역 | 사용 중인 키 |
|---|---|
| Discord·운영 로그 | `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `WEBHOOK_DISCORD` |
| Mongo | `MONGODB_HOST`, `MONGODB_PORT`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_DATABASE` |
| 대화·이미지 생성 | `LLM_OPENAI_{BASEURL,API_KEY,MODELS}`, `IMAGE_OPENAI_{BASEURL,API_KEY,MODELS}` |
| 검색·임베딩·전처리 | `ELASTIC_HOST`, `ELASTIC_API`, `EMBEDDING_OPENAI_{BASEURL,API_KEY,MODEL}`, `VISION_OPENAI_{BASEURL,API_KEY,MODEL}`, `JINA_READER_API_KEY` |
| Kafka | `KAFKA_ENABLE`, `KAFKA_CLIENT_ID`, `KAFKA_REST_PROXY`, `KAFKA_TOPIC` |

중괄호 표기는 키의 접미사 목록이지 실제 환경변수 한 개의 이름이 아니다. 모델 목록의 `MODELS`와 단일 모델 `MODEL`을 구분한다. 실제 비밀값을 문서·예시·로그에 복사하지 않는다.

### 4.2 외부 연동의 활성화는 동일하지 않음

- Elasticsearch는 호출 시 host/API 설정을 검사하고 없으면 예외를 던진다. `ELASTIC_API` 형식은 `id:api_key`다.
- Kafka는 `KAFKA_ENABLE`과 `KAFKA_REST_PROXY`가 모두 truthy인 경우 활성화된다. 문자열 `'false'`도 truthy이므로 boolean parser가 있다고 가정하면 안 된다. REST Proxy로 broker를 조회하고 KafkaJS producer로 보낸다. REST Proxy에 메시지를 직접 POST하는 구조가 아니다.
- OpenAI 클라이언트와 대화·이미지 모델 목록은 각 기능 첫 호출 때 초기화하고 재사용한다. 임베딩과 Vision 클라이언트도 서로 독립적으로 지연 생성한다. API 키 누락은 해당 기능 호출에서 실패하며, 사용하지 않는 AI 기능 때문에 import나 CLI 도움말이 실패하지 않는다. 가짜 키나 무인증 fallback은 추가하지 않는다.

### 4.3 진입점과 종료

- 기존 네 진입점과 `package.json` 명령을 사용한다. 새 `bot.ts`/`worker.ts`/`runtime.ts`로 대체하는 구현은 이 문서의 컨벤션 작업 범위가 아니다.
- 아카이브는 `requestArchiveShutdown`, `trackArchiveWork`, `waitForTrackedArchiveWork`를 공유하며 종료 promise를 재사용한다. 단, 현재 모든 live 이벤트 작업이 추적되는 것은 아니다.
- `createMongooseConnection`은 현재 `mongoose.connect()`를 return/await하지 않는다. 호출부가 await하더라도 연결 완료 장벽이 되지 않는 **현재 제약**이다. 연결 대기를 생략하라는 권장이 아니다.
- `embedding` CLI의 `cursor.eachAsync`도 현재 await되지 않는다. 출력 카운트가 작업 완료를 증명하지 않는 점을 구분한다.
- `backfill --date` 설명은 `yyyymmdd`지만 구현은 `${date}T00:00:00.000Z`를 `Date`에 넣는다. 문서 작업에서 형식이 올바르다고 확정하거나 조용히 코드를 수정하지 않는다.
- 명령 배포 도구는 전역 명령을 삭제한 뒤 다시 등록한다. 읽기 전용 검증에 실행하지 않는다.

### 4.4 import 부작용과 안전한 검증

`src/cli.ts --help`도 정적 import 때문에 파일 로거와 `./database/failure_urls.db`를 초기화한다. 운영 디렉터리에서 단순 도움말이 완전한 읽기 전용이라고 가정하지 않는다.

안전한 확인은 소스·package·tsconfig를 임시 디렉터리에 복사하고 node_modules를 연결한 뒤 임시 작업 디렉터리에서 도움말을 실행하는 방식이다. AI 설정을 모두 제거한 환경에서도 exit 0과 세 명령의 출력을 확인했다. Discord 로그인, Mongo 연결, API 요청을 검증했다는 의미는 아니다.

자동화 에이전트는 root [AGENTS.md](../../AGENTS.md)의 금지 명령을 따른다. Docker helper는 stop/remove/recreate를 수행하므로 문서 검증용으로 실행하지 않는다.

## 5. 로깅·오류 처리

- `src/lib/logger.ts`의 Winston 인스턴스를 재사용한다. 새 `console.log` 기반 로거를 추가하지 않는다.
- 문맥이 필요하면 기존 `channel_log_message`와 Discord `LogContext`를 사용한다. 해당 helper는 `bigint`를 문자열화하고 `channel` 객체를 비워 순환·대형 객체 직렬화를 줄인다.
- 파일 로그는 소스/빌드 기준 `../../logs`에 기록한다. `all`은 7일, `error`는 14일 보관 설정이다.
- 사용자용 provider 오류는 `replyMessagePerError`의 기존 계약을 확인한다. 현재 알 수 없는 오류는 문자열화한 예외를 포함할 수 있으므로 “모든 오류가 안전하게 정제된다”는 보장은 없다.
- 운영 webhook은 `config.WEBHOOK_DISCORD`를 사용하고 전송 실패를 로깅한다. 메시지·provider 원문에 민감정보가 있을 수 있으므로 새 로그에 토큰이나 전체 설정 객체를 넣지 않는다.
- provider별 `null`, 상위 오류 전파, 사용자 응답의 의미를 구분한다. 오류를 조용히 숨기는 로깅 공통 계층을 임의로 추가하지 않는다.

## 6. 아이콘 provider의 구체 계약

### 6.1 데이터와 확장 위치

```ts
// src/models/index.ts의 현재 공유 형식
export interface Icon {
  keywords: string[];
  imagePath: string;
  isRemoteImage: boolean;
}
```

- 새 provider는 `src/repository/icons/<provider>/index.ts`에서 기존 base를 확장하고 `IconSearchEngine`의 `_repositories`에 등록한다.
- `IconRepository`는 `Singleton`을 상속하며 `findOne(searchKeyword): Promise<Icon | null>`과 동기 `imagePathResolver(imagePath): string`을 제공한다.
- 현재 base의 메서드 본문은 문자열 `'not implemented'`를 던진다. 확장 시 두 동작을 제공해야 하며, 문자열 throw 자체를 새 오류 처리 규칙으로 복제하지 않는다.
- `IconttvRepository`는 `_streamerName`으로 동일 API의 다른 카탈로그를 선택한다. 두 provider 클래스는 이 값만 선언한다. 공통 fetch·캐시를 복사하지 않는다.
- Singleton은 생성자 이름을 키로 재사용한다. `IconSearchEngine.instance`는 별도의 static getter 패턴이다. 하나의 통일된 DI 시스템이 있다고 설명하지 않는다.

### 6.2 매칭·순서·반환

- provider 순서는 `_repositories` 선언 순서인 `smalljuzi6974`, `funzinnu`다. 허용 목록의 순서가 검색 우선순위를 바꾸지는 않는다.
- `providers` 미지정 **또는 빈 배열**은 전체 provider를 검색한다. 알려지지 않은 이름만 있는 비어 있지 않은 배열은 모두 건너뛴다.
- 키워드는 lower-case 변환 후 완전일치한다. fuzzy, substring, trim 매칭을 추가하면 기능 변경이다.
- provider 내부 `findOne`은 아직 해석하지 않은 경로를 반환한다. `useOrigin`이면 `originUri`, 아니면 `uri`를 선택한다.
- 엔진은 provider resolver로 `imagePath`를 바꾼 뒤 `copyIcon`으로 키워드 배열까지 복사해 돌려준다. `{ icon, publicUrl }`로 감싸는 반환 계약이 아니다.
- `getIconttvUrl`은 절대 URL을 보존하거나 CDN prefix를 붙이고 `size=100` 쿼리를 설정한다. 단순 `new URL(path, base)`만으로 같은 결과를 보장하지 못한다.

### 6.3 캐시와 실패

- 캐시는 `IconttvRepository`별 목록에 있고 5분이다. 검색 엔진의 결과 캐시는 주석 처리되어 활성화되어 있지 않다.
- 빈 목록은 `isEmpty()`가 true이므로 만료 시간과 별개로 다시 fetch 대상이다. “빈 결과도 5분 캐시”는 현재 동작이 아니다.
- 동시 fetch 조절은 `isIconLoading`, `acquireLock`, 재검사, `finally` 해제로 구현되어 있다. 이것이 완전한 single-flight를 보장한다고 확대 해석하지 않는다. 대기 timeout 후 다른 작업의 플래그를 해제할 가능성 등은 별도 개선 검토 대상이다.
- fetch 오류는 로깅 후 `null`을 반환하여 다음 provider 탐색이 가능하다. 엔진이 모든 provider 예외를 포괄적으로 catch하는 것은 아니다.

## 7. 별도 LLM 블랙박스 구현과 비교

### 7.1 절차와 재현 범위

먼저 위 모듈을 읽어 기능과 공개 입력·출력을 파악했다. 그 다음 소스·기존 helper 이름·AGENTS·대화 이력을 보내지 않는 `completion` 요청을 두 번 실행했다. 요청은 stateless이며 도구가 없었다. 아래는 실제 요청과 실제 응답 일부다. 생성된 구현은 실행하거나 소스에 적용하지 않았다. 비교 후의 “잘못된 예시”는 일반 TypeScript 설계의 오답이 아니라 **이 레포에 그대로 적용할 때 계약이 깨지는 예시**다.

공통 system 요청:

> You are an independent TypeScript implementer. You have no repository source, files, tools, history, or knowledge of its coding conventions. Implement only the supplied functional requirements as a compact, concrete TypeScript example, without executing or applying code. Include your implementation choices. Do not ask to inspect a repository. Keep the response under 1100 words.

### 7.2 요청 C1: 설정·런타임

> Implement configuration and startup for a TypeScript Discord.js 14 bot package that also has a separate message archive worker and a Commander operations CLI. It uses MongoDB/Mongoose, a configured OpenAI-compatible API, and optional Elasticsearch and Kafka. Read configuration from environment variables and dotenv files; development and deployed environments use different files. Startup must connect MongoDB, register Discord events, then log in. The archive worker must stop accepting work, wait for in-flight work, destroy Discord, and disconnect MongoDB on a termination signal. The CLI should support a help-only invocation and a guild message backfill command. Show representative files and startup/configuration APIs, including logging. Node 24 and strict TypeScript, CommonJS build.

실제 응답 발췌 — 이 레포에 그대로 적용하면 잘못된 환경 계약:

```ts
const env = process.env.NODE_ENV ?? "development";
const file = process.env.DOTENV_FILE ??
  (env === "development" ? ".env.development" : ".env.production");
```

실제 응답의 별도 로거 발췌:

```ts
export function log(level: string, event: string, detail?: unknown) {
  console.log(JSON.stringify({
    time: new Date().toISOString(), level, event,
    detail: detail instanceof Error
      ? { name: detail.name, message: detail.message, stack: detail.stack }
      : detail
  }));
}
```

| 비교점 | 실제 LLM 응답 | 이 레포에서 유지할 형태 |
|---|---|---|
| 환경 이름·파일 | `development`, `.env.development`, `.env.production`, `DOTENV_FILE` | `prod`/그 외, `.env`/`.env.dev`, 기존 `config` |
| 설정 키 | `MONGODB_URI`, `DISCORD_TOKEN`, `OPENAI_BASE_URL` | 현재 `MONGODB_*`, `DISCORD_BOT_TOKEN`, 역할별 `*_OPENAI_*` |
| 로깅 | 새 `log()`와 `console.log` | `src/lib/logger.ts` 재사용 |
| 진입점 | `bot.ts`, `worker.ts`, `runtime.ts` 추가 | 현재 네 진입점과 `package.json` 유지 |
| 종료 추적·연결 await | 모든 쓰기 추적, 연결을 실제 await | 합리적인 구현이지만 현재 구현과 다름. 이를 잘못된 패턴으로 분류하지 않음 |
| CLI 도움말 | action 전까지 설정·연결 지연 | 합리적인 개선 방향. 현재 import 부작용이 없다고 문서화하면 안 됨 |

현재 코드와 맞는 설정 사용 예시:

```ts
import { config } from './config';
import logger from './lib/logger';

logger.info(`Runtime environment: ${config.ENV}`);
```

LLM 구현의 검증·지연 초기화·종료 추적을 단지 기존에 없다는 이유로 금지하지 않는다. 도입하려면 기존 호출자·설정·동작을 함께 변경하는 별도 작업이 필요하다는 뜻이다.

### 7.3 요청 C2: provider·검색

> Implement a reusable icon search subsystem in strict TypeScript for a Discord bot. Multiple remote icon catalogs are searched in configured provider order, optionally restricted to requested providers; return the first matching icon or null. Match a catalog keyword exactly ignoring letter case. An icon contains keyword strings, an image path, and whether it is remote. The provider returns its original image path, and a separate provider operation resolves it to a public URL before the caller receives the result. Cache each catalog for five minutes, avoid redundant simultaneous fetches, and log catalog failures without failing an overall no-match search. Show the provider contract, one remote adapter, search composition, and registration of a second catalog. Do not implement Discord event handling.

실제 응답 발췌 — 이 레포에 그대로 적용하면 잘못된 형식:

```ts
export interface Icon {
  readonly keywords: readonly string[];
  readonly imagePath: string; // Original catalog value
  readonly remote: boolean;
}

export interface IconProvider {
  readonly id: string;
  fetchCatalog(): Promise<readonly Icon[]>;
  resolvePublicUrl(icon: Icon): Promise<string>;
}

export interface IconMatch {
  readonly provider: string;
  readonly icon: Icon; // Preserves the original path
  readonly publicUrl: string;
}
```

실제 응답에서 빈 허용 목록을 처리한 부분:

```ts
const allowed = requestedProviders === undefined
  ? undefined
  : new Set(requestedProviders);
```

| 비교점 | 실제 LLM 응답 | 현재 계약·판정 |
|---|---|---|
| 원격 여부 | `remote` | `isRemoteImage`; 이름을 바꾸면 payload 소비자와 불일치 |
| provider API | 전체 목록 fetch와 async URL resolver | `findOne`과 동기 `imagePathResolver`; 기존 엔진과 연결 불가 |
| 검색 결과 | `{ provider, icon, publicUrl }` | 해석된 `imagePath`를 가진 `Icon | null` |
| 빈 provider 배열 | 아무 것도 검색하지 않음 | 현재는 전체 검색; 사용자 관찰 동작이 달라짐 |
| 빈 카탈로그 | 5분 동안 캐시 | 현재는 재조회 대상; 변경 시 의도와 호출량을 검토해야 함 |
| fetch 중복 방지 | 공유 in-flight promise | 타당한 다른 설계. 현재 flag-lock 패턴보다 나쁘다고 주장하지 않음 |
| 매칭·우선순위 | 대소문자 무시 완전일치, 등록 순서 우선 | 현재와 일치; 잘못된 예시로 넣지 않음 |

현재 코드에서 재사용할 검색 호출 형태:

```ts
import IconSearchEngine from './repository/search/IconSearchEngine';

const icon = await IconSearchEngine.instance.searchIcon(
  keyword,
  guildId,
  providers,
  context
);
```

위 호출 예시는 `keyword`, `guildId`, `providers`, `context`가 호출자의 입력인 부분 예시다. 새 provider를 도입할 때 독립 LLM의 타입을 그대로 복사하지 않고 현재 `Icon`과 repository 계약을 구현한다.

## 8. 편집 체크리스트

- 수정할 기능의 진입점·호출자·실제 설정 키를 먼저 읽었는가?
- formatter 설정과 관찰된 코드 습관을 구별했는가?
- 새 로그·클라이언트·캐시를 추가하기 전에 기존 helper를 확인했는가?
- 설정 이름, 반환 shape, provider 순서, 빈 배열 의미, URL 쿼리를 유지했는가?
- 기존 버그나 대안 설계를 “반드시 따라야 할 스타일”로 잘못 기록하지 않았는가?
- 동작 변경 시 관련 호출자와 문서를 함께 바꾸고 실제 경로를 검증했는가?
- 문서 확인을 이유로 Discord 로그인·명령 재등록·운영 DB 변경을 하지 않았는가?
