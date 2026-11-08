import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  archivedMentions,
  archivedImages,
  archivedEditedTimestamp,
  archivedMessageContent,
} from '../src/web/messagePresentation';

test('mention names support Discord API objects and archived discord.js snapshots', () => {
  const api = archivedMentions({
    mentions: [
      {
        id: '123',
        username: 'account',
        global_name: '표시 이름',
        member: { nick: '닉네임' },
      },
    ],
  });
  assert.equal(api.users['123'], '닉네임');
  const snapshot = archivedMentions(
    JSON.stringify({
      content: '<@!123> 안녕\n역할 <@&456>\n<#789>',
      cleanContent: '@AiAgent 안녕\n역할 @운영자\n#비공개',
      mentions: { users: ['123'], roles: ['456'], channels: ['789'] },
    })
  );
  assert.equal(snapshot.users['123'], 'AiAgent');
  assert.equal(snapshot.roles['456'], '운영자');
  assert.equal('channels' in snapshot, false);
  assert.equal(Object.keys(archivedMentions('invalid JSON').users).length, 0);
});

test('edit timestamps support stored dates and archived Discord payloads without reviving removed content', () => {
  const timestamp = '2026-11-08T12:30:00.000Z';
  assert.equal(archivedEditedTimestamp(new Date(timestamp), {}), timestamp);
  assert.equal(
    archivedEditedTimestamp(
      null,
      JSON.stringify({ editedTimestamp: Date.parse(timestamp) })
    ),
    timestamp
  );
  assert.equal(
    archivedEditedTimestamp(undefined, { edited_timestamp: timestamp }),
    timestamp
  );
  assert.equal(
    archivedEditedTimestamp(null, { editedTimestamp: null }),
    undefined
  );
  assert.equal(archivedEditedTimestamp('invalid', {}), undefined);
  assert.equal(
    archivedMessageContent(
      { message: '', editedAt: timestamp, EMBEDDING_INPUT: 'old removed text' },
      0,
      'stale index'
    ),
    ''
  );
  assert.equal(
    archivedMessageContent(
      { editedAt: timestamp, EMBEDDING_INPUT: 'old removed text' },
      0,
      'stale index'
    ),
    ''
  );
  assert.equal(
    archivedMessageContent({ message: 'updated text' }, 0, 'stale index'),
    'updated text'
  );
});

test('image attachments keep signed URLs and spoilers, reject external URLs and respect removal', () => {
  const signed =
    'https://media.discordapp.net/attachments/100/200/SPOILER_picture.png?ex=ffff1234&is=12345678&hm=signature';
  const images = archivedImages(
    [
      {
        id: '200',
        name: 'SPOILER_picture.png',
        contentType: 'image/png',
        proxyURL: signed,
      },
      {
        id: '201',
        filename: 'old.jpg',
        url: 'https://cdn.discordapp.com/attachments/100/201/old.jpg',
      },
      {
        id: '202',
        name: 'clip.mp4',
        contentType: 'video/mp4',
        width: 600,
        height: 400,
      },
      {
        id: '203',
        name: 'x.png',
        content_type: 'image/png',
        url: 'https://evil.example/x.png',
      },
      { id: '204', name: 'x.png', contentType: 'text/html', url: signed },
    ],
    null
  );
  assert.equal(images.length, 3);
  assert.equal(images[0].url, signed);
  assert.equal(images[0].spoiler, true);
  assert.equal(images[1].spoiler, false);
  assert.equal(images[2].url, '');
  assert.deepEqual(
    archivedImages([], { attachments: [{ filename: 'old.jpg', url: signed }] }),
    []
  );
  assert.equal(
    archivedImages(
      undefined,
      JSON.stringify({ attachments: [{ filename: 'old.jpg', url: signed }] })
    ).length,
    1
  );
});

test('ambiguous or changed cleanContent is not guessed as a mention name', () => {
  for (const raw of [
    { content: '<@123> <@456>', cleanContent: '@first name @last name' },
    { content: 'hello <@123>', cleanContent: 'changed @name' },
    { content: '<@123>', cleanContent: '<@123>' },
  ])
    assert.equal(Object.keys(archivedMentions(raw).users).length, 0);
});
