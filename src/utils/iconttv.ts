import { Icon } from '../models';

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

  url.searchParams.set('size', '100');
  // if (
  //   Math.random() > 0.5 ||
  //   url.pathname.includes('.gif') ||
  //   url.pathname.includes('.webp')
  // ) {
  //   url.searchParams.set('nocache', 'true');
  // }

  return url.toString();
}

export function copyIcon(icon: Icon): Icon {
  return {
    keywords: [...icon.keywords],
    imagePath: icon.imagePath,
    isRemoteImage: icon.isRemoteImage,
  };
}
