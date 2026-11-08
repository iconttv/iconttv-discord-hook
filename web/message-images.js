function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
      /^\/(?:attachments|ephemeral-attachments)\/\d+\/\d+\/[^/]+$/.test(
        url.pathname
      )
      ? url
      : null;
  } catch {
    return null;
  }
}

function expired(url) {
  const value = url?.searchParams.get('ex');
  if (!value || !/^[a-f\d]{1,16}$/i.test(value)) return false;
  const seconds = Number.parseInt(value, 16);
  return Number.isSafeInteger(seconds) && seconds * 1000 <= Date.now();
}

function discordLink(messageLink, className) {
  const link = document.createElement('a');
  link.href = messageLink;
  link.className = className;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function placeholder(frame, messageLink, isExpired) {
  const link = discordLink(messageLink, 'attachment-placeholder');
  const title = document.createElement('span');
  title.className = 'attachment-placeholder-title';
  title.textContent = isExpired ? '만료된 이미지' : '이미지를 불러올 수 없어요';
  const description = document.createElement('span');
  description.textContent = isExpired
    ? '디스코드에서 확인해 주세요.'
    : '이미지가 만료되었을 수 있어요. 디스코드에서 확인해 주세요.';
  link.append(title, description);
  frame.replaceChildren(link);
}

export function renderMessageImages(target, images = [], messageLink) {
  target.replaceChildren();
  target.hidden = !images.length;
  for (const attachment of images.slice(0, 10)) {
    const frame = document.createElement('div');
    frame.className = 'attachment-frame';
    const load = () => {
      const url = imageUrl(attachment.url);
      const isExpired = expired(url);
      if (!url || isExpired) return placeholder(frame, messageLink, isExpired);
      const link = discordLink(messageLink, 'attachment-preview');
      link.title = '디스코드에서 첨부 이미지 보기';
      const image = document.createElement('img');
      image.className = 'attachment-image';
      image.alt = attachment.name || '첨부 이미지';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener(
        'error',
        () => placeholder(frame, messageLink, false),
        { once: true }
      );
      image.src = url.href;
      link.append(image);
      frame.replaceChildren(link);
    };
    if (attachment.spoiler) {
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'attachment-spoiler';
      reveal.textContent = '스포일러 이미지 보기';
      reveal.addEventListener('click', load, { once: true });
      frame.append(reveal);
    } else load();
    target.append(frame);
  }
}
