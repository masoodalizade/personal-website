'use strict';
const $ = selector => document.querySelector(selector);
const {escape: esc, safeUrl, inline: noteInline} = window.SiteContent;

async function read(file) {
  const response = await fetch('./data/' + file + '.json', {cache: 'no-store'});
  if (!response.ok) throw Error('دریافت محتوا ممکن نشد');
  return response.json();
}

function animate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(element => element.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }), {threshold: .07});
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
}

function noteSource(note) {
  let result = note.sourceReference ? '<div class="note-source">برگرفته از ' + esc(note.sourceReference) + '</div>' : '';
  const links = (Array.isArray(note.supplementalSources) ? note.supplementalSources : []).map(item => {
    const url = safeUrl(item.url, false);
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title || new URL(url).hostname) + '</a>' : '';
  }).filter(Boolean);
  if (links.length) result += '<div class="note-source">منابع تکمیلی: ' + links.join(' · ') + '</div>';
  return result;
}

async function start() {
  const page = document.body.dataset.page;
  if (page === 'experiences') {
    const events = (await read('events')).filter(item => item.published !== false)
      .sort((a, b) => b.year - a.year || (b.order || 0) - (a.order || 0));
    let previousYear = null;
    $('#events').innerHTML = events.map((item, index) => {
      const showYear = item.year !== previousYear;
      previousYear = item.year;
      return '<div id="event-' + esc(item.id) + '" class="event ' + (index % 2 ? 'left' : 'right') + ' reveal"><span class="dot" aria-hidden="true"></span><time class="year" dir="ltr">' + (showYear ? esc(item.year) : '') + '</time><a class="box" href="./experience.html?id=' + encodeURIComponent(item.id) + '"><h2>' + esc(item.title) + '</h2><p>' + esc(item.description) + '</p><span class="event-reading">روایت این تجربه <span aria-hidden="true">←</span></span></a></div>';
    }).join('');
  }
  if (page === 'experience') {
    const id = new URLSearchParams(location.search).get('id');
    const item = (await read('events')).find(event => event.id === id && event.published !== false);
    const back = '<a class="back" href="./' + (item ? '#event-' + encodeURIComponent(item.id) : '') + '">بازگشت به تجربه‌ها</a>';
    if (!item) {
      document.title = 'تجربه پیدا نشد — مسعود علیزاده';
      $('#experience').innerHTML = back + '<h2 class="missing-title">این تجربه پیدا نشد.</h2>';
      return;
    }
    document.title = item.title + ' — مسعود علیزاده';
    document.querySelector('meta[name="description"]').content = item.description || item.title;
    const image = safeUrl(item.image), narrative = window.SiteContent.body(item.body);
    $('#experience').innerHTML = back + '<time>سال ' + esc(item.year) + '</time><h2>' + esc(item.title) + '</h2>' +
      (item.description ? '<p class="intro">' + esc(item.description) + '</p>' : '') +
      (image ? '<img class="cover" src="' + esc(image) + '" alt="' + esc(item.imageAlt || '') + '">' : '') +
      (narrative ? '<div class="body">' + narrative + '</div>' : '') +
      window.SiteContent.media(item.media) + window.SiteContent.evidence(item.evidence);
  }
  if (page === 'notes') {
    const notes = (await read('notes')).filter(item => item.published !== false).sort((a, b) => b.date.localeCompare(a.date));
    $('#notes').innerHTML = notes.map(item => {
      const image = safeUrl(item.image);
      return '<a class="note reveal" href="./post.html?id=' + encodeURIComponent(item.id) + '"><div class="note-copy"><time>' + esc(item.date) + '</time><h2>' + esc(item.title) + '</h2><p>' + esc(item.description) + '</p><span class="reading">' + esc(item.readingMinutes || 5) + ' دقیقه مطالعه</span></div>' + (image ? '<img loading="lazy" src="' + esc(image) + '" alt="">' : '') + '</a>';
    }).join('');
  }
  if (page === 'post') {
    const id = new URLSearchParams(location.search).get('id');
    const item = (await read('notes')).find(note => note.id === id && note.published !== false);
    if (!item) {
      $('#post').textContent = 'این یادداشت پیدا نشد.';
      return;
    }
    document.title = item.title + ' — مسعود علیزاده';
    const image = safeUrl(item.image);
    $('#post').innerHTML = '<a class="back" href="./notes.html">بازگشت به یادداشت‌ها</a><time>' + esc(item.date) + ' · ' + esc(item.readingMinutes || 5) + ' دقیقه مطالعه</time><h2>' + esc(item.title) + '</h2><p class="intro">' + esc(item.description) + '</p>' + (image ? '<img class="cover" src="' + esc(image) + '" alt="">' : '') + '<div class="body">' + String(item.body || '').split(/\n\s*\n/).map(paragraph => '<p>' + noteInline(paragraph) + '</p>').join('') + '</div>' + noteSource(item);
  }
  animate();
}

start().catch(error => {
  console.error(error);
  const main = $('main');
  if (main) main.insertAdjacentHTML('beforeend', '<p style="text-align:center;color:#888;font-size:13px">بارگذاری محتوا با مشکل مواجه شد.</p>');
});
