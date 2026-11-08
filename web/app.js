import { renderMessageContent } from './message-format.js';
import { discordTargets, openDiscordLink } from './discord-links.js';
import { renderMessageImages } from './message-images.js';

const $ = id => document.getElementById(id);
const escape = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]
  );
const state = {
  session: null,
  page: 1,
  hasMore: false,
  loading: false,
  settings: null,
  request: null,
  toastTimer: null,
  cancelDiscordLaunch: null,
  collapsedCategories: new Set(),
};

function mediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function avatar(url, name) {
  const safe = mediaUrl(url);
  return safe
    ? `<img src="${escape(safe)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : escape([...String(name || '?')][0]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
  });
  const body = await response.json().catch(() => ({
    error: '응답을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
  }));
  if (!response.ok) {
    const error = new Error(
      typeof body?.error === 'string' && body.error
        ? body.error
        : '요청을 처리하지 못했습니다.'
    );
    error.code = body?.code;
    error.status = response.status;
    if (response.status === 401) showAuthDialog(error.message, 401);
    throw error;
  }
  return body;
}

function showGate(title, description) {
  state.cancelDiscordLaunch?.();
  state.session = null;
  state.request?.abort();
  $('gate').hidden = false;
  $('gate-title').textContent = title;
  $('gate-description').textContent = description;
  $('copy-command').hidden = false;
  $('search-view').hidden = true;
  $('settings-view').hidden = true;
  $('settings-nav').hidden = true;
  $('messages').replaceChildren();
  $('channels').innerHTML =
    '<p class="sidebar-hint">새 링크로 다시 연결해 주세요.</p>';
  $('session-time').textContent = '세션 연결 필요';
  $('logout').hidden = true;
  setDrawer(false);
}

function showAuthDialog(message, status) {
  showGate('인증 필요', '');
  $('copy-command').hidden = true;
  $('auth-dialog-title').textContent =
    status === 401 ? '인증 오류 (401)' : '세션 만료';
  $('auth-dialog-description').textContent = message;
  if (!$('auth-dialog').open) $('auth-dialog').showModal();
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 2500);
}

function setDrawer(open) {
  $('sidebar').classList.toggle('open', open);
  $('drawer-shade').hidden = !open;
  $('open-sidebar').setAttribute('aria-expanded', String(open));
  if (open) $('close-sidebar').focus();
}

function currentParams() {
  return new URLSearchParams(location.search);
}

function formParams(page = 1) {
  const params = new URLSearchParams();
  const keyword = $('keyword').value.trim();
  if (keyword) params.set('keyword', keyword);
  const channelId = currentParams().get('channelId');
  if (channelId) params.set('channelId', channelId);
  params.set('embedding', String($('embedding').checked));
  if (keyword) params.set('sort', $('sort').value);
  if ($('after').value) params.set('after', $('after').value);
  if ($('before').value) params.set('before', $('before').value);
  if (page > 1) params.set('page', String(page));
  return params;
}

function readForm() {
  const params = currentParams();
  $('keyword').value = params.get('keyword') || '';
  $('embedding').checked = params.get('embedding') === 'true';
  $('after').value = params.get('after') || '';
  $('before').value = params.get('before') || '';
  $('sort').value = $('keyword').value.trim()
    ? params.get('sort') || 'relevance'
    : 'newest';
  $('sort').disabled = !$('keyword').value.trim();
  state.page = Number(params.get('page') || 1);
  renderChannels();
}

function renderChannels() {
  if (!state.session) return;
  const selected = currentParams().get('channelId') || '';
  const channels = state.session.channels;
  $('channel-count').textContent = String(channels.length);
  let output = `<button class="channel-item ${selected ? '' : 'active'}" data-channel=""><span class="channel-hash">#</span><span>모든 채널</span></button>`;
  const groups = new Map();
  for (const channel of channels) {
    const category = channel.category || '텍스트 채널';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(channel);
  }
  let groupIndex = 0;
  for (const [category, entries] of groups) {
    const collapsed = state.collapsedCategories.has(category);
    const groupId = `channel-group-${groupIndex++}`;
    output += `<button class="category-toggle" data-category="${escape(category)}" aria-expanded="${!collapsed}" aria-controls="${groupId}"><svg class="category-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg><span>${escape(category)}</span></button><div id="${groupId}"${collapsed ? ' hidden' : ''}>`;
    for (const channel of entries) {
      output += `<button class="channel-item ${channel.parentName ? 'thread' : ''} ${selected === channel.id ? 'active' : ''}" data-channel="${escape(channel.id)}" title="${escape(channel.parentName ? channel.parentName + ' › ' + channel.name : channel.name)}"><span class="channel-hash">${channel.parentName ? '<svg class="thread-branch" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3v10h11m-4-4 4 4-4 4"/></svg>' : '#'}</span><span>${escape(channel.name)}</span></button>`;
    }
    output += '</div>';
  }
  $('channels').innerHTML = output;
  const channel = channels.find(item => item.id === selected);
  $('scope-label').textContent = channel
    ? `# ${channel.parentName ? channel.parentName + ' › ' : ''}${channel.name}`
    : '모든 채널';
}

function formatDate(value, time = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '시간 정보 없음';
  return new Intl.DateTimeFormat(
    'ko-KR',
    time
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
  ).format(date);
}

function renderMessages(messages, keyword) {
  let day = '';
  $('messages').innerHTML = messages
    .map(message => {
      const date = formatDate(message.timestamp);
      const divider =
        day !== date ? `<div class="day-divider">${escape(date)}</div>` : '';
      day = date;
      const locationName = `${message.parentChannelName ? message.parentChannelName + ' › ' : ''}${message.channelName}`;
      const guildId = encodeURIComponent(state.session.guildId);
      const channelId = encodeURIComponent(message.channelId);
      const link = `https://discord.com/channels/${guildId}/${channelId}/${encodeURIComponent(message.id)}`;
      const channelLink = `https://discord.com/channels/${guildId}/${channelId}`;
      const content = message.content || '[본문이 없는 메시지]';
      const edited =
        message.editedTimestamp &&
        Number.isFinite(Date.parse(message.editedTimestamp))
          ? `<time class="message-edited" datetime="${escape(message.editedTimestamp)}" title="수정 시각: ${escape(new Date(message.editedTimestamp).toLocaleString('ko-KR'))}">(수정됨)</time>`
          : '';
      const long = content.length > 700 || content.split('\n').length > 8;
      return `${divider}<article class="message" aria-label="${escape(message.senderName)}의 메시지">
      <div class="avatar">${avatar(message.avatarUrl, message.senderName)}</div>
      <div class="message-body"><div class="message-meta"><span class="message-author">${escape(message.senderName)}</span><span class="message-timing"><a class="message-time" href="${link}" target="_blank" rel="noopener noreferrer" title="${escape(formatDate(message.timestamp))} · 디스코드 원문 보기"><time datetime="${escape(message.timestamp)}">${escape(formatDate(message.timestamp, true))}</time></a>${edited}</span><a class="message-channel" href="${channelLink}" target="_blank" rel="noopener noreferrer" title="디스코드에서 ${escape(locationName)} 열기"># ${escape(locationName)} ↗</a></div>
      <div class="message-content ${long ? 'collapsed' : ''}"></div>${long ? '<button class="expand-message" aria-expanded="false">본문 더 보기</button>' : ''}
      <div class="message-images" hidden></div>
      <a class="message-original" href="${link}" target="_blank" rel="noopener noreferrer">디스코드에서 보기 ↗</a></div></article>`;
    })
    .join('');
  const users = Object.fromEntries(
    messages.map(message => [message.senderId, message.senderName])
  );
  users[state.session.userId] = state.session.displayName;
  $('messages')
    .querySelectorAll('.message-content')
    .forEach((target, index) => {
      const message = messages[index];
      target.hidden = !message.content && Boolean(message.images?.length);
      renderMessageContent(target, message.content || '[본문이 없는 메시지]', {
        keyword,
        guildId: state.session.guildId,
        channels: state.session.channels,
        users: { ...users, ...message.mentions?.users },
        roles: message.mentions?.roles,
      });
      renderMessageImages(
        target.parentElement.querySelector('.message-images'),
        message.images,
        target.parentElement.querySelector('.message-original').href
      );
    });
}

function skeleton() {
  $('messages').innerHTML = Array.from(
    { length: 5 },
    () =>
      '<div class="skeleton" aria-hidden="true"><div class="skeleton-circle"></div><div class="skeleton-lines"><span></span><span></span><span></span></div></div>'
  ).join('');
}

async function loadMessages() {
  if (!state.session) return;
  state.request?.abort();
  const request = new AbortController();
  state.request = request;
  state.loading = true;
  state.hasMore = false;
  readForm();
  const params = currentParams();
  const keyword = (params.get('keyword') || '').trim();
  $('result-title').textContent = keyword ? '검색 결과' : '최근 메시지';
  $('result-count').textContent = '불러오는 중…';
  $('search-notice').hidden = true;
  $('result-state').hidden = true;
  $('messages').setAttribute('aria-busy', 'true');
  $('previous-page').disabled = true;
  $('next-page').disabled = true;
  skeleton();
  try {
    const result = await api('/api/search?' + params, {
      signal: request.signal,
    });
    if (request.signal.aborted || !state.session) return;
    renderMessages(result.messages, keyword);
    state.page = result.page;
    state.hasMore = result.hasMore;
    $('result-count').textContent = `${result.total.toLocaleString()}개`;
    $('page-number').textContent = String(result.page);
    $('pagination-description').textContent =
      `${result.page}페이지 · 페이지당 25개`;
    if (!result.messages.length) {
      $('result-state').hidden = false;
      $('result-state').innerHTML =
        `<span class="empty-symbol">⌕</span><strong>${keyword ? '일치하는 대화를 찾지 못했어요' : '아직 표시할 메시지가 없어요'}</strong><p>${keyword ? '다른 검색어를 입력하거나 채널·기간 필터를 넓혀 보세요.' : '선택한 채널과 기간에 저장된 메시지가 없습니다.'}</p>`;
    }
    if (result.source === 'mongodb') {
      $('search-notice').hidden = false;
      $('search-notice').className = 'notice';
      $('search-notice').textContent = keyword
        ? '검색 서비스 복구 중입니다. 기본 단어 검색과 날짜 정렬로 결과를 보여드려요.'
        : '검색 서비스 복구 중입니다. 저장된 원본 메시지를 보여드려요.';
    }
  } catch (error) {
    if (
      error.name === 'AbortError' ||
      error.status === 401 ||
      request.signal.aborted
    )
      return;
    $('messages').replaceChildren();
    $('result-count').textContent = '';
    $('result-state').hidden = false;
    $('result-state').innerHTML =
      `<span class="empty-symbol">!</span><strong>메시지를 불러오지 못했어요</strong><p>${escape(error.message)}</p><button class="secondary-button" id="retry-search">다시 시도</button>${error.code === 'SEMANTIC_UNAVAILABLE' ? '<button class="primary-button" id="use-text-search">일반 검색으로 전환</button>' : ''}`;
  } finally {
    if (state.request === request) {
      state.loading = false;
      $('messages').setAttribute('aria-busy', 'false');
      $('previous-page').disabled = state.page <= 1;
      $('next-page').disabled = !state.hasMore;
      $('message-scroll').scrollTop = 0;
    }
  }
}

function navigateSearch(params = formParams()) {
  history.pushState(null, '', '/search?' + params);
  showView('search');
  void loadMessages();
  setDrawer(false);
}

function showView(view) {
  if (!state.session) return;
  $('gate').hidden = true;
  $('search-view').hidden = view !== 'search';
  $('settings-view').hidden = view !== 'settings';
  $('browse-nav').classList.toggle('active', view === 'search');
  $('settings-nav').classList.toggle('active', view === 'settings');
  $('page-title').textContent = view === 'settings' ? '서버 설정' : '대화 검색';
  document.title = `${view === 'settings' ? '서버 설정' : '대화 검색'} · ${state.session.guildName}`;
}

function applySettings() {
  if (!state.settings) return;
  $('image-resize').checked = state.settings.enableFeatureIconImageResize;
  $('question-everyone').checked =
    state.settings.enableCommandQuestionForEveryone;
  settingsDirty();
}

function settingsDirty() {
  const changed =
    state.settings &&
    ($('image-resize').checked !==
      state.settings.enableFeatureIconImageResize ||
      $('question-everyone').checked !==
        state.settings.enableCommandQuestionForEveryone);
  $('settings-save').disabled = !changed;
  $('settings-reset').disabled = !changed;
  $('settings-dirty').textContent = changed
    ? '저장하지 않은 변경 사항이 있어요.'
    : '변경 사항이 없습니다.';
}

async function loadSettings() {
  if (!state.session?.capabilities.includes('settings:write')) {
    navigateSearch(currentParams());
    return;
  }
  state.request?.abort();
  showView('settings');
  setDrawer(false);
  $('settings-status').textContent = '설정을 불러오는 중…';
  $('image-resize').disabled = true;
  $('question-everyone').disabled = true;
  $('settings-save').disabled = true;
  try {
    state.settings = await api('/api/settings');
    applySettings();
    $('settings-status').textContent = '';
    $('image-resize').disabled = false;
    $('question-everyone').disabled = false;
  } catch (error) {
    $('settings-status').textContent = error.message;
  }
}

function updateSessionTime() {
  if (!state.session) return;
  const remaining = new Date(state.session.expiresAt).getTime() - Date.now();
  if (remaining <= 0) {
    showAuthDialog(
      '검색 세션이 만료되었습니다. 디스코드에서 새 링크를 받아 주세요.'
    );
    return;
  }
  $('session-time').textContent = `세션 ${Math.ceil(remaining / 60000)}분 남음`;
}

async function initialize() {
  const params = currentParams();
  const token = params.get('token');
  if (token) {
    params.delete('token');
    history.replaceState(
      null,
      '',
      location.pathname + (params.size ? '?' + params : '')
    );
  }
  try {
    if (token)
      await api('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    state.session = await api('/api/session');
    const session = state.session;
    $('window-title').textContent = session.guildName;
    $('guild-name').textContent = session.guildName;
    $('user-name').textContent = session.displayName;
    $('user-avatar').innerHTML = avatar(session.avatarUrl, session.displayName);
    $('server-icon').innerHTML = avatar(
      session.guildIconUrl,
      session.guildName
    );
    $('server-icon').title = session.guildName;
    $('guild-link').href =
      'https://discord.com/channels/' + encodeURIComponent(session.guildId);
    $('settings-nav').hidden = !session.capabilities.includes('settings:write');
    $('logout').hidden = false;
    readForm();
    updateSessionTime();
    setInterval(updateSessionTime, 15000);
    if (location.pathname === '/settings') await loadSettings();
    else {
      showView('search');
      await loadMessages();
    }
  } catch (error) {
    // api() has already displayed the server's authentication error. Preserve
    // that message instead of replacing it with a generic welcome screen.
    if (error.status === 401) return;
    showGate(
      '서버에 연결할 수 없어요',
      '잠시 후 새로고침해 주세요.\n' + error.message
    );
  }
}

$('search-form').addEventListener('submit', event => {
  event.preventDefault();
  navigateSearch();
});
$('keyword').addEventListener('input', () => {
  const empty = !$('keyword').value.trim();
  $('sort').disabled = empty;
  if (empty) $('sort').value = 'newest';
});
$('sort').addEventListener('change', () => navigateSearch());
$('embedding').addEventListener('change', () => navigateSearch());
$('clear-keyword').addEventListener('click', () => {
  $('keyword').value = '';
  navigateSearch();
  $('keyword').focus();
});
$('reset-filters').addEventListener('click', () => {
  $('after').value = '';
  $('before').value = '';
  $('embedding').checked = false;
  $('sort').value = 'relevance';
  navigateSearch();
});
$('channels').addEventListener('click', event => {
  const category = event.target.closest('[data-category]');
  if (category) {
    const name = category.dataset.category;
    const collapsed = !state.collapsedCategories.has(name);
    if (collapsed) state.collapsedCategories.add(name);
    else state.collapsedCategories.delete(name);
    category.setAttribute('aria-expanded', String(!collapsed));
    $(category.getAttribute('aria-controls')).hidden = collapsed;
    return;
  }
  const item = event.target.closest('[data-channel]');
  if (!item || !state.session) return;
  const params = formParams();
  if (item.dataset.channel) params.set('channelId', item.dataset.channel);
  else params.delete('channelId');
  navigateSearch(params);
});
$('previous-page').addEventListener('click', () =>
  navigateSearch(formParams(state.page - 1))
);
$('next-page').addEventListener('click', () =>
  navigateSearch(formParams(state.page + 1))
);
$('messages').addEventListener('click', event => {
  const button = event.target.closest('.expand-message');
  if (!button) return;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.previousElementSibling.classList.toggle('collapsed', expanded);
  button.setAttribute('aria-expanded', String(!expanded));
  button.textContent = expanded ? '본문 더 보기' : '접기';
});
$('messages').addEventListener(
  'error',
  event => {
    if (event.target.tagName === 'IMG' && event.target.closest('.avatar'))
      event.target.replaceWith(document.createTextNode('·'));
  },
  true
);
$('result-state').addEventListener('click', event => {
  if (event.target.id === 'retry-search') void loadMessages();
  if (event.target.id === 'use-text-search') {
    $('embedding').checked = false;
    navigateSearch();
  }
});
$('browse-nav').addEventListener('click', () => {
  if (state.session) navigateSearch(currentParams());
});
$('settings-nav').addEventListener('click', () => {
  history.pushState(null, '', '/settings?' + currentParams());
  void loadSettings();
});
$('server-icon').addEventListener('click', () => {
  if (state.session) navigateSearch(new URLSearchParams('embedding=false'));
});
$('open-sidebar').addEventListener('click', () => setDrawer(true));
$('close-sidebar').addEventListener('click', () => setDrawer(false));
$('drawer-shade').addEventListener('click', () => setDrawer(false));
$('auth-dialog').addEventListener('cancel', event => event.preventDefault());
$('leave-page').addEventListener('click', () => {
  window.close();
  setTimeout(() => {
    $('close-page-hint').hidden = false;
  }, 250);
});
$('dismiss-discord-fallback').addEventListener('click', () => {
  state.cancelDiscordLaunch?.();
  $('discord-fallback').hidden = true;
});
document.addEventListener('click', event => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = event.target.closest('a[href]');
  if (
    !anchor ||
    anchor.hasAttribute('data-browser-only') ||
    !discordTargets(anchor.href)
  )
    return;
  event.preventDefault();
  state.cancelDiscordLaunch?.();
  $('discord-browser-link').href = anchor.href;
  $('discord-fallback').hidden = false;
  state.cancelDiscordLaunch = openDiscordLink(anchor.href);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setDrawer(false);
});
$('settings-form').addEventListener('change', settingsDirty);
$('settings-reset').addEventListener('click', applySettings);
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('settings-save').disabled = true;
  $('settings-reset').disabled = true;
  $('image-resize').disabled = true;
  $('question-everyone').disabled = true;
  $('settings-status').textContent = '저장하는 중…';
  try {
    state.settings = await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enableFeatureIconImageResize: $('image-resize').checked,
        enableCommandQuestionForEveryone: $('question-everyone').checked,
      }),
    });
    applySettings();
    $('settings-status').textContent = '서버 설정을 저장했어요.';
  } catch (error) {
    $('settings-status').textContent = error.message;
  } finally {
    $('image-resize').disabled = false;
    $('question-everyone').disabled = false;
    settingsDirty();
  }
});
$('copy-command').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('/itvweb');
    toast('명령어를 복사했어요. 디스코드에 붙여넣으세요.');
  } catch {
    toast('디스코드에서 /itvweb를 입력해 주세요.');
  }
});
$('logout').addEventListener('click', async () => {
  try {
    await api('/api/session', { method: 'DELETE' });
    showGate(
      '로그아웃했어요',
      '디스코드에서 받은 링크로 다시 연결할 수 있어요.'
    );
  } catch (error) {
    toast(error.message);
  }
});
window.addEventListener('popstate', () => {
  if (!state.session) return;
  if (location.pathname === '/settings') void loadSettings();
  else {
    showView('search');
    void loadMessages();
  }
});
void initialize();
