'use strict';

window.SiteContent = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function safeUrl(value, relative = true) {
    const raw = String(value ?? '').trim();
    if (!raw || /[\u0000-\u001f\\]/.test(raw)) return '';
    try {
      const url = new URL(raw, location.href);
      if (!/^https?:$/.test(url.protocol)) return '';
      if (!relative && !/^https?:\/\//i.test(raw)) return '';
      if (url.username || url.password) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  const inline = text => escape(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const body = text => String(text || '').trim().split(/\n\s*\n/).filter(Boolean)
    .map(paragraph => '<p>' + inline(paragraph) + '</p>').join('');

  function video(value) {
    const href = safeUrl(value);
    if (!href) return null;
    const url = new URL(href), host = url.hostname.toLowerCase();
    let id = '';
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || '';
    } else if (host === 'youtu.be' || host === 'www.youtu.be') {
      id = url.pathname.slice(1).split('/')[0];
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return {type: 'embed', url: 'https://www.youtube-nocookie.com/embed/' + id};
    if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
      const match = url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/);
      if (match) {
        const hash = url.searchParams.get('h') || match[2] || '';
        const embed = new URL('https://player.vimeo.com/video/' + match[1]);
        if (/^[a-zA-Z0-9]+$/.test(hash)) embed.searchParams.set('h', hash);
        return {type: 'embed', url: embed.href};
      }
    }
    if (/\.(mp4|webm|ogv|ogg|m4v|mov)$/i.test(url.pathname)) return {type: 'file', url: href};
    return {type: 'link', url: href};
  }

  function media(items) {
    if (!Array.isArray(items)) return '';
    return items.map((item, index) => {
      const url = safeUrl(item.url);
      if (!url) return '';
      let visual = '';
      if (item.type === 'image') {
        visual = '<a class="media-image-link" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="' + escape(url) + '" alt="' + escape(item.alt || item.caption || '') + '"></a>';
      } else if (item.type === 'video') {
        const source = video(url), title = escape(item.caption || 'ویدیوی تجربه ' + (index + 1));
        if (source.type === 'embed') {
          visual = '<div class="video-frame"><iframe src="' + escape(source.url) + '" title="' + title + '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
        } else if (source.type === 'file') {
          visual = '<video controls playsinline preload="metadata" aria-label="' + title + '"><source src="' + escape(source.url) + '">مرورگر شما پخش این ویدیو را پشتیبانی نمی‌کند.</video><a class="media-original" href="' + escape(source.url) + '" target="_blank" rel="noopener noreferrer">باز کردن فایل ویدیو ↗</a>';
        } else {
          visual = '<a class="video-external" href="' + escape(source.url) + '" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▷</span> تماشای ویدیو ↗</a>';
        }
      }
      if (!visual) return '';
      return '<figure class="experience-media">' + visual + (item.caption ? '<figcaption>' + escape(item.caption) + '</figcaption>' : '') + '</figure>';
    }).join('');
  }

  function evidence(items) {
    if (!Array.isArray(items)) return '';
    const links = items.map(item => {
      const url = safeUrl(item.url, false);
      return url ? '<li><a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">' + escape(item.title || new URL(url).hostname) + ' <span aria-hidden="true">↗</span></a></li>' : '';
    }).filter(Boolean);
    return links.length ? '<section class="experience-evidence" aria-label="شاهدهای این تجربه"><h3>شاهدهای این تجربه</h3><ul>' + links.join('') + '</ul></section>' : '';
  }

  return {escape, safeUrl, inline, body, video, media, evidence};
})();
