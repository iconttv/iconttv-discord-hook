export function discordTargets(value, userAgent = navigator.userAgent) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.origin !== 'https://discord.com' ||
    !/^\/(?:channels\/(?:@me|\d+)(?:\/\d+){0,2}|users\/\d+)\/?$/.test(
      url.pathname
    ) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return null;
  return {
    web: url.href,
    app: /Android/i.test(userAgent)
      ? `intent://discord.com${url.pathname}#Intent;scheme=https;package=com.discord;S.browser_fallback_url=${encodeURIComponent(url.href)};end`
      : `discord://-${url.pathname}`,
  };
}

export function openDiscordLink(value, runtime = window) {
  const targets = discordTargets(value, runtime.navigator.userAgent);
  if (!targets) return null;
  const document = runtime.document;
  const cancel = () => {
    runtime.clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibilityChanged);
    runtime.removeEventListener('pagehide', cancel);
    runtime.removeEventListener('blur', cancel);
  };
  const visibilityChanged = () => {
    if (document.hidden) cancel();
  };
  // There is no reliable installed-app API. Loss of focus may mean the app or
  // the browser's launch prompt opened, so stop automatic navigation then.
  const timer = runtime.setTimeout(() => {
    cancel();
    if (!document.hidden) runtime.location.assign(targets.web);
  }, 1800);
  document.addEventListener('visibilitychange', visibilityChanged);
  runtime.addEventListener('pagehide', cancel);
  runtime.addEventListener('blur', cancel);
  try {
    runtime.location.assign(targets.app);
  } catch {
    cancel();
    runtime.location.assign(targets.web);
  }
  return cancel;
}
