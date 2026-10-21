const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = {window: {}, URL, location: {href: 'https://example.com/personal-website/experience.html?id=e001'}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/content.js'), 'utf8'), context);
const content = context.window.SiteContent;

test('media URLs and captions cannot inject executable HTML', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'https://user:password@example.com/a']) assert.equal(content.safeUrl(value), '');
  assert.equal(content.media([{type: 'image', url: 'javascript:alert(1)'}]), '');
  const html = content.media([{type: 'image', url: './assets/a.jpg', caption: '<script>alert(1)</script>', alt: '" onerror="alert(1)'}]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('alt="&quot; onerror=&quot;alert(1)"'));
  assert.equal(content.evidence([{title: 'bad', url: '/local'}]), '');
});

test('relative images keep GitHub Pages subpaths and paragraphs retain emphasis', () => {
  assert.equal(content.safeUrl('./assets/media/photo.jpg'), 'https://example.com/personal-website/assets/media/photo.jpg');
  assert.equal(content.body('یک **تجربه**\n\nدو'), '<p>یک <strong>تجربه</strong></p><p>دو</p>');
  assert.equal(content.body(''), '');
  assert.equal(content.media([]) + content.evidence([]), '');
});

test('video providers are allowlisted and native files retain signed query strings', () => {
  const id = '6Vf06WaqDN0';
  for (const value of ['https://youtu.be/' + id + '?si=abc', 'https://www.youtube.com/watch?v=' + id, 'https://www.youtube.com/shorts/' + id]) {
    assert.equal(content.video(value).url, 'https://www.youtube-nocookie.com/embed/' + id);
    assert.equal(content.video(value).type, 'embed');
  }
  assert.equal(content.video('https://youtube.com.evil.test/watch?v=' + id).type, 'link');
  assert.equal(content.video('https://vimeo.com/123456/secret').url, 'https://player.vimeo.com/video/123456?h=secret');
  assert.equal(content.video('https://cdn.example.com/video.MP4?token=abc').type, 'file');
  assert.ok(content.media([{type: 'video', url: './assets/video.mp4'}]).includes('<video controls playsinline preload="metadata"'));
  assert.ok(!content.media([{type: 'video', url: 'https://www.youtube.com/watch?v=' + id}]).includes('autoplay'));
  assert.equal(content.video('javascript:alert(1)'), null);
});

test('every experience has a unique safe ID and valid media collections', () => {
  const events = JSON.parse(fs.readFileSync(path.join(root, 'data/events.json'), 'utf8'));
  assert.equal(new Set(events.map(item => item.id)).size, events.length);
  for (const item of events) {
    assert.match(item.id, /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
    assert.ok(Array.isArray(item.media));
    assert.ok(Array.isArray(item.evidence));
  }
});
