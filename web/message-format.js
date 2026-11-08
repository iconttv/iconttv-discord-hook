const inlineTokens =
  /\\[\\`*_~|[\]()<>]|`{1,2}[^`\n]+`{1,2}|\*\*\*[^\n]+?\*\*\*|\*\*[^\n]+?\*\*|__[^\n]+?__|~~[^\n]+?~~|\|\|[\s\S]+?\|\||\*[^*\n]+?\*|(?<!\w)_[^_\n]+?_(?!\w)|<@!?\d+>|<@&\d+>|<#\d+>|<a?:\w+:\d+>|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|<https?:\/\/[^\s<>]+>|https?:\/\/[^\s<>]+|@(?:everyone|here)\b/g;

const element = (tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

function link(url, label) {
  const node = element('a');
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  node.textContent = label;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function text(parent, value, pattern) {
  if (!pattern) {
    parent.append(document.createTextNode(value));
    return;
  }
  for (const [index, part] of value.split(pattern).entries()) {
    if (index % 2) {
      const mark = element('mark');
      mark.textContent = part;
      parent.append(mark);
    } else parent.append(document.createTextNode(part));
  }
}

function inline(parent, value, context, depth = 0, allowLinks = true) {
  if (depth > 8) return text(parent, value, context.highlight);
  let position = 0;
  // Each recursion gets its own iterator, so nested emphasis cannot change
  // another level's scan position. Message text is never interpreted as HTML.
  for (const match of value.matchAll(new RegExp(inlineTokens))) {
    text(parent, value.slice(position, match.index), context.highlight);
    const token = match[0];
    let node;
    if (token.startsWith('\\')) {
      text(parent, token.slice(1), context.highlight);
    } else if (token.startsWith('`')) {
      node = element('code');
      node.textContent = token.replace(/^`+|`+$/g, '');
    } else if (/^<a?:/.test(token)) {
      const [, animated, name, id] = token.match(/^<(a?):(\w+):(\d+)>$/);
      node = element('img', 'discord-emoji');
      node.src = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=48`;
      node.alt = `:${name}:`;
      node.title = `:${name}:`;
      node.loading = 'lazy';
      node.referrerPolicy = 'no-referrer';
      node.addEventListener(
        'error',
        () => node.replaceWith(document.createTextNode(node.alt)),
        { once: true }
      );
    } else if (/^<[@#]/.test(token)) {
      const [, kind, id] = token.match(/^<(@[!&]?|#)(\d+)>$/);
      const channel = context.channels?.find(item => item.id === id);
      const role = kind === '@&';
      const name =
        kind === '#'
          ? channel?.name || id
          : (role ? context.roles?.[id] : context.users?.[id]) || id;
      const label = `${kind === '#' ? '#' : '@'}${name}`;
      const url =
        kind === '#'
          ? channel && `https://discord.com/channels/${context.guildId}/${id}`
          : !role && `https://discord.com/users/${id}`;
      node = url && allowLinks ? link(url, '') : element('span');
      node.className = 'discord-mention';
      node.title = `${label} (${id})`;
      text(node, label, context.highlight);
    } else if (token === '@everyone' || token === '@here') {
      node = element('span', 'discord-mention');
      node.textContent = token;
    } else if (/^(?:\[|<?https?:)/.test(token)) {
      const masked = token.match(/^\[([^\]]+)\]\((.+)\)$/);
      let address = masked ? masked[2] : token.replace(/^<|>$/g, '');
      let suffix = '';
      if (!masked && !token.startsWith('<')) {
        suffix = address.match(/[.,!?;:]+$/)?.[0] || '';
        address = address.slice(0, address.length - suffix.length);
        while (
          address.endsWith(')') &&
          (address.match(/\)/g) || []).length >
            (address.match(/\(/g) || []).length
        ) {
          address = address.slice(0, -1);
          suffix = ')' + suffix;
        }
      }
      const url = safeUrl(address);
      if (url && allowLinks) {
        node = link(url, '');
        node.title = url;
        inline(node, masked ? masked[1] : address, context, depth + 1, false);
        parent.append(node);
        node = null;
        text(parent, suffix, context.highlight);
      } else text(parent, token, context.highlight);
    } else {
      const delimiter = ['***', '**', '__', '~~', '||', '*', '_'].find(item =>
        token.startsWith(item)
      );
      const contents = token.slice(delimiter.length, -delimiter.length);
      if (delimiter === '||') {
        node = element('span', 'discord-spoiler');
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', '스포일러 보기');
        node.setAttribute('aria-expanded', 'false');
        const hidden = element('span');
        hidden.setAttribute('aria-hidden', 'true');
        inline(hidden, contents, context, depth + 1, false);
        node.append(hidden);
        const reveal = event => {
          if (event.type === 'keydown' && !['Enter', ' '].includes(event.key))
            return;
          event.preventDefault();
          node.classList.add('revealed');
          node.setAttribute('aria-expanded', 'true');
          node.removeAttribute('aria-label');
          hidden.removeAttribute('aria-hidden');
        };
        node.addEventListener('click', reveal);
        node.addEventListener('keydown', reveal);
      } else {
        node = element(
          {
            '***': 'strong',
            '**': 'strong',
            __: 'u',
            '~~': 's',
            '*': 'em',
            _: 'em',
          }[delimiter]
        );
        const inner = delimiter === '***' ? element('em') : node;
        if (inner !== node) node.append(inner);
        inline(inner, contents, context, depth + 1, allowLinks);
      }
    }
    if (node) parent.append(node);
    position = match.index + token.length;
  }
  text(parent, value.slice(position), context.highlight);
}

export function renderMessageContent(target, content, options = {}) {
  const terms = (options.keyword || '')
    .split(/\s+/)
    .map(term => term.replace(/^["+|-]+|"+$/g, ''))
    .filter(term => term && !['AND', 'OR', 'NOT'].includes(term))
    .slice(0, 12);
  const highlight = terms.length
    ? new RegExp(
        '(' +
          terms
            .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|') +
          ')',
        'gi'
      )
    : null;
  const context = { ...options, highlight };
  const lines = String(content)
    .slice(0, 12000)
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      const code = [];
      const opening = line.trimStart().slice(3);
      const sameLineEnd = opening.indexOf('```');
      if (sameLineEnd >= 0) {
        code.push(opening.slice(0, sameLineEnd));
      } else {
        while (index + 1 < lines.length && !/^\s*```/.test(lines[index + 1]))
          code.push(lines[++index]);
        if (index + 1 < lines.length) index++;
      }
      const pre = element('pre');
      const body = element('code');
      body.textContent = code.join('\n');
      pre.append(body);
      fragment.append(pre);
      if (sameLineEnd >= 0 && opening.slice(sameLineEnd + 3)) {
        const remaining = element('div', 'markdown-line');
        inline(remaining, opening.slice(sameLineEnd + 3), context);
        fragment.append(remaining);
      }
    } else if (/^> /.test(line)) {
      const quote = element('blockquote');
      const quoted = [line.slice(2)];
      while (lines[index + 1]?.startsWith('> '))
        quoted.push(lines[++index].slice(2));
      inline(quote, quoted.join('\n'), context);
      fragment.append(quote);
    } else if (/^(?:[-*] |\d+\. )/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const pattern = ordered ? /^\d+\. / : /^[-*] /;
      const list = element(ordered ? 'ol' : 'ul');
      if (ordered) list.start = Math.min(1000000, Number.parseInt(line, 10));
      do {
        const item = element('li');
        inline(item, lines[index].replace(pattern, ''), context);
        list.append(item);
        if (!pattern.test(lines[index + 1] || '')) break;
        index++;
      } while (index < lines.length);
      fragment.append(list);
    } else {
      const heading = line.match(/^(#{1,3}) (.+)$/);
      const paragraph = element(
        heading ? `h${heading[1].length + 2}` : 'div',
        'markdown-line'
      );
      if (line === '') paragraph.append(element('br'));
      else inline(paragraph, heading ? heading[2] : line, context);
      fragment.append(paragraph);
    }
  }
  target.replaceChildren(fragment);
}
