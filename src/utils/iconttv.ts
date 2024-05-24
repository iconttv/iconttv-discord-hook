export function getIconttvUrl(urlpath: string): string {
  const ICONTTV_IMAGE_PREFIX = 'https://api.probius.dev/twitch-icons/cdn';

  const urlString = (() => {
    if (urlpath.startsWith('http://') || urlpath.startsWith('https://')) {
      return urlpath;
    }
    if (urlpath.startsWith('./')) {
      return `${ICONTTV_IMAGE_PREFIX}/${urlpath.slice(2)}`;
    }
    if (urlpath.startsWith('/')) {
      return `${ICONTTV_IMAGE_PREFIX}/${urlpath.slice(1)}`;
    }
    return `${ICONTTV_IMAGE_PREFIX}/${urlpath}`;
  })();

  const url = new URL(urlString);

  // url.searchParams.set('ts', `${Date.now()}`);

  return url.toString();
}
