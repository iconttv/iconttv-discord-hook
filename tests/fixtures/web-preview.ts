// Synthetic browser fixture. Never imports config, Mongo or the Discord gateway.
import { resolve } from 'node:path';
import { PermissionFlagsBits } from 'discord.js';
import { createWebServer } from '../../src/web/app';
import type {
  WebSession,
  WebSettings,
  WebSearchMessage,
} from '../../src/web/types';

const session: WebSession = {
  id: 'preview-only',
  userId: '123456789012345678',
  displayName: '테스트 사용자',
  avatarUrl: '',
  guildId: '100000000000000001',
  guildName: '아카이브 테스트 서버',
  guildIconUrl: '',
  initialChannelId: '200000000000000001',
  permissions: PermissionFlagsBits.ModerateMembers.toString(),
  expiresAt: new Date(Date.now() + 3600000),
  channels: [
    { id: '200000000000000001', name: '💬・잡담', category: '이야기' },
    {
      id: '200000000000000002',
      name: '🔬 실험실',
      category: '이야기',
      parentName: '💬・잡담',
    },
    { id: '200000000000000003', name: '🎮・게임', category: '이야기' },
    { id: '200000000000000004', name: '개발', category: '프로젝트' },
    { id: '200000000000000005', name: '자료실', category: '프로젝트' },
  ],
};
let settings: WebSettings = {
  enableFeatureIconImageResize: true,
  enableCommandQuestionForEveryone: false,
};
interface PreviewMessage {
  name: string;
  text: string;
  mentions?: WebSearchMessage['mentions'];
  editedTimestamp?: string;
  images?: WebSearchMessage['images'];
}
const messages: PreviewMessage[] = [
  {
    name: '렌더링 테스트',
    text: '<@1472610941118976152> 안녕! <@&300000000000000001> <#200000000000000002> <:wave:400000000000000001> <a:dance:400000000000000002>\n**굵게** *기울임* __밑줄__ ~~취소선~~ ||스포일러||\n[문서 보기](https://example.com/docs) https://example.com/path\n> 인용문\n- 목록 하나\n- 목록 둘\n`<@123> **코드**`\n```js\nconst text = "<img src=x onerror=alert(1)>";\n```',
    mentions: {
      users: { '1472610941118976152': 'AiAgent' },
      roles: { '300000000000000001': '운영자' },
    },
  },
  {
    name: '하늘',
    text: '어제 이야기했던 검색 페이지 정리해 봤어요.\n검색 결과에서 바로 원래 대화로 돌아갈 수 있으면 편할 것 같아요.',
  },
  {
    name: '민트',
    text: '맞아요. 키워드 없이 들어가면 최근 메시지부터 보여주면 좋겠어요.\n어디까지 이야기했는지 확인하기도 쉽고요.',
  },
  {
    name: '도윤',
    text: '채널 이름이 오른쪽에 있으니까 어디서 한 이야기인지 바로 보이네요.',
  },
  {
    name: '하늘',
    text: '프로필과 닉네임, 본문은 익숙한 배치 그대로 두었어요.\n테마도 브라우저 설정을 따라가도록 했습니다.',
  },
  {
    name: '민트',
    text: '스레드에서도 찾을 수 있는 거죠? 검색이라는 건 결국 예전에 나눈 이야기를 다시 꺼내는 일이니까요.',
  },
  {
    name: '도윤',
    text: '네, 권한이 있는 채널 안에서만 찾아요. 검색어는 여기서 바꿀 수 있어요.\n덕분에 매번 명령어를 입력하지 않아도 되겠네요.',
  },
  {
    name: '테스트',
    text: '<img src=x onerror="window.__xss=true"> 이 내용은 실행되지 않고 문자로 표시되어야 합니다.',
  },
];
const attachmentMessages: PreviewMessage[] = [
  {
    name: '첨부 테스트',
    text: '12',
    editedTimestamp: '2026-11-08T10:15:00.000Z',
    images: [
      {
        id: '401',
        name: 'preview.png',
        url: 'https://media.discordapp.net/attachments/200/401/preview.png?ex=ffffffff&hm=test',
        spoiler: false,
      },
      {
        id: '402',
        name: 'expired.png',
        url: 'https://cdn.discordapp.com/attachments/200/402/expired.png?ex=1&hm=test',
        spoiler: false,
      },
      {
        id: '403',
        name: 'broken.png',
        url: 'https://cdn.discordapp.com/attachments/200/403/broken.png',
        spoiler: false,
      },
      {
        id: '404',
        name: 'SPOILER_preview.png',
        url: 'https://cdn.discordapp.com/attachments/200/404/SPOILER_preview.png',
        spoiler: true,
      },
    ],
  },
  {
    name: '이미지만 첨부',
    text: '',
    images: [
      {
        id: '405',
        name: 'image-only.png',
        url: 'https://media.discordapp.net/attachments/200/405/image-only.png',
        spoiler: false,
      },
    ],
  },
];
const server = createWebServer({
  origin: 'http://127.0.0.1:3099',
  assets: resolve('web'),
  findSession: async token =>
    token === 'preview-only'
      ? session
      : token === 'reader-only'
        ? { ...session, permissions: '0' }
        : null,
  search: async (_session, options) => {
    if (options.keyword === 'error') throw new Error('synthetic outage');
    return {
      messages:
        options.keyword === 'empty'
          ? []
          : (options.keyword === 'attachments'
              ? attachmentMessages
              : messages
            ).map((message, index) => {
              const channel =
                session.channels.find(
                  channel => channel.id === options.channelId
                ) || session.channels[index % session.channels.length];
              return {
                id: `${options.page}${index}000000000000000`,
                channelId: channel.id,
                channelName: channel.name,
                parentChannelName: channel.parentName,
                senderName: message.name,
                senderId: String(index),
                timestamp: new Date(
                  Date.UTC(2026, 10, 8, 9, 50 - index * 7)
                ).toISOString(),
                content: message.text,
                editedTimestamp: message.editedTimestamp,
                images: message.images,
                mentions: message.mentions,
                link: 'https://discord.com/',
              };
            }),
      page: options.page,
      hasMore: options.page < 3,
      total: options.keyword === 'empty' ? 0 : 68,
      source: options.keyword === 'fallback' ? 'mongodb' : 'elasticsearch',
    };
  },
  getSettings: async () => settings,
  saveSettings: async (_guildId, _actor, value) => {
    settings = value;
  },
  onError: () => {},
});
server.listen(3099, '127.0.0.1');
