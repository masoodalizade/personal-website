'use strict';
const REPO = 'masoodalizade/personal-website';
const API = 'https://api.github.com/repos/' + REPO + '/';
const {escape, safeUrl} = window.SiteContent;
const el = id => document.getElementById(id);
let token = '', section = 'events', data = {events: [], notes: []}, shas = {}, selected = -1, readonly = false, busy = false;
const dirtySections = new Set(), pendingUploads = new Map();

function setStatus(message, bad = false) {
  el('status').textContent = message;
  el('status').style.color = bad ? '#a33' : '#666';
}

async function request(path, options = {}) {
  const headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? {'Authorization': 'Bearer ' + token} : {})};
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(API + path, {...options, headers});
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.message || 'خطای GitHub: ' + response.status);
  }
  return response.json();
}
const post = (path, body) => request(path, {method: 'POST', body: JSON.stringify(body)});

function decodeBase64(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), char => char.charCodeAt(0)));
}
function bytesBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function load() {
  const files = await Promise.all(['events', 'notes'].map(key => request('contents/data/' + key + '.json?ref=main')));
  ['events', 'notes'].forEach((key, index) => {
    shas[key] = files[index].sha;
    data[key] = JSON.parse(decodeBase64(files[index].content));
  });
  selected = data[section].length ? 0 : -1;
  dirtySections.clear();
  pendingUploads.clear();
  render();
}

function markDirty() {
  dirtySections.add(section);
  el('save').disabled = readonly || busy;
  setStatus('تغییرات این بخش هنوز ذخیره نشده‌اند.');
}

function field(label, name, value, type = 'text', extra = '') {
  return '<label for="field-' + name + '">' + label + '</label><input id="field-' + name + '" data-field="' + name + '" type="' + type + '" value="' + escape(value) + '" ' + extra + '>';
}
function uploadInput(target, type) {
  const accept = type === 'image' ? '.jpg,.jpeg,.png,.gif,.webp,.avif' : '.mp4,.webm,.ogv,.ogg,.m4v,.mov';
  return '<label class="upload-label" for="upload-' + target + '">یا انتخاب فایل ' + (type === 'image' ? 'تصویر' : 'ویدیو') + '</label><input id="upload-' + target + '" class="upload-input" type="file" data-upload="' + target + '" data-kind="' + type + '" accept="' + accept + '">';
}

function mediaFields(items) {
  return (items || []).map((item, index) => {
    const title = item.type === 'video' ? 'ویدیو' : 'تصویر';
    return '<fieldset class="media-row" data-index="' + index + '"><legend>' + title + ' ' + (index + 1) + '</legend>' +
      '<label for="media-url-' + index + '">نشانی ' + title + '</label><input id="media-url-' + index + '" data-media="url" dir="ltr" value="' + escape(item.url) + '" placeholder="https://…">' +
      uploadInput('media-' + index, item.type) +
      '<label for="media-caption-' + index + '">توضیح زیر ' + title + '</label><input id="media-caption-' + index + '" data-media="caption" value="' + escape(item.caption) + '">' +
      (item.type === 'image' ? '<label for="media-alt-' + index + '">توصیف تصویر برای دسترس‌پذیری</label><input id="media-alt-' + index + '" data-media="alt" value="' + escape(item.alt) + '">' : '<p class="field-help">لینک مستقیم فایل، YouTube و Vimeo در همین صفحه پخش می‌شوند؛ لینک سایر سرویس‌ها با دکمهٔ تماشا باز می‌شود.</p>') +
      '<div class="row-actions"><button type="button" data-media-action="up" data-index="' + index + '" ' + (index === 0 ? 'disabled' : '') + '>بالاتر</button><button type="button" data-media-action="down" data-index="' + index + '" ' + (index === items.length - 1 ? 'disabled' : '') + '>پایین‌تر</button><button type="button" class="danger" data-media-action="remove" data-index="' + index + '">حذف ' + title + '</button></div></fieldset>';
  }).join('');
}

function evidenceFields(items) {
  return (items || []).map((item, index) => '<fieldset class="evidence-row" data-index="' + index + '"><legend>شاهد ' + (index + 1) + '</legend><label for="evidence-title-' + index + '">عنوان شاهد</label><input id="evidence-title-' + index + '" data-evidence="title" value="' + escape(item.title) + '"><label for="evidence-url-' + index + '">لینک شاهد</label><input id="evidence-url-' + index + '" data-evidence="url" dir="ltr" value="' + escape(item.url) + '" placeholder="https://…"><div class="row-actions"><button type="button" class="danger" data-evidence-remove="' + index + '">حذف شاهد</button></div></fieldset>').join('');
}

function render() {
  el('tab-events').classList.toggle('primary', section === 'events');
  el('tab-notes').classList.toggle('primary', section === 'notes');
  el('save').disabled = readonly || busy || !dirtySections.has(section);
  el('new').disabled = readonly || busy;
  const items = data[section];
  el('items').innerHTML = items.map((item, index) => '<button type="button" data-index="' + index + '" class="' + (selected === index ? 'active' : '') + '">' + escape(item.title || 'بدون عنوان') + '<div class="muted">' + escape(section === 'events' ? item.year : item.date) + (item.published === false ? ' · پیش‌نویس' : '') + '</div></button>').join('');
  el('items').querySelectorAll('button').forEach(button => button.onclick = () => {
    capture(); selected = Number(button.dataset.index); render();
  });
  const item = items[selected];
  if (!item) {
    el('editor').innerHTML = '<p>موردی انتخاب نشده است.</p>';
    return;
  }
  let fields = field('عنوان', 'title', item.title) + '<label for="field-description">توضیح کوتاه</label><textarea id="field-description" data-field="description">' + escape(item.description) + '</textarea>';
  if (section === 'events') {
    fields += '<div class="line"><div>' + field('سال شمسی', 'year', item.year, 'number', 'min="1300" max="1500"') + '</div><div>' + field('ترتیب در همان سال (عدد بزرگ‌تر بالاتر)', 'order', item.order ?? 1, 'number') + '</div></div>' +
      field('شناسه ثابت تجربه', 'id', item.id, 'text', 'dir="ltr" readonly') + '<p class="field-help">این شناسه آدرس صفحهٔ تجربه است و با تغییر عنوان یا سال عوض نمی‌شود.</p>' +
      '<label for="field-body">متن کامل روایت</label><textarea id="field-body" data-field="body" class="body-editor" placeholder="روایت کامل این تجربه…">' + escape(item.body) + '</textarea><p class="field-help">بین بندها یک خط خالی بگذار. برای تأکید، متن را میان دو جفت ستاره قرار بده: **متن مهم**</p>' +
      field('نشانی تصویر اصلی (اختیاری)', 'image', item.image || '', 'text', 'dir="ltr" placeholder="https://…"') + uploadInput('cover', 'image') + field('توصیف تصویر اصلی', 'imageAlt', item.imageAlt || '') +
      '<section class="editor-section"><h2>تصویرها و ویدیوها</h2><p class="field-help">برای هر تجربه می‌توانی چند تصویر و ویدیو با توضیح جداگانه اضافه کنی و ترتیبشان را تغییر بدهی. هر فایل حداکثر ۲۵ مگابایت؛ برای فایل‌های بزرگ‌تر لینک بگذار.</p>' + mediaFields(item.media) + '<div class="row-actions"><button type="button" id="add-image">+ تصویر</button><button type="button" id="add-video">+ ویدیو</button></div></section>' +
      '<section class="editor-section"><h2>شاهدهای این تجربه</h2><p class="field-help">لینک مطلب، مصاحبه، پروژه یا سندی که به این روایت مربوط است.</p>' + evidenceFields(item.evidence) + '<button type="button" id="add-evidence">+ شاهد</button></section>';
  } else {
    fields += '<div class="line"><div>' + field('شناسه انگلیسی یکتا', 'id', item.id, 'text', 'dir="ltr"') + '</div><div>' + field('تاریخ (YYYY-MM-DD)', 'date', item.date, 'date') + '</div></div>' + field('زمان مطالعه (دقیقه)', 'readingMinutes', item.readingMinutes || 5, 'number', 'min="1"') + field('نشانی تصویر مقاله (اختیاری)', 'image', item.image || '', 'text', 'dir="ltr"') + '<label for="field-body">متن کامل یادداشت</label><textarea id="field-body" data-field="body" class="body-editor">' + escape(item.body) + '</textarea>';
  }
  fields += '<label><input type="checkbox" data-field="published" ' + (item.published !== false ? 'checked' : '') + '> منتشر شود</label><div class="toolbar">' + (item.published !== false ? '<a class="editor-preview" href="../' + (section === 'events' ? 'experience' : 'post') + '.html?id=' + encodeURIComponent(item.id) + '" target="_blank" rel="noopener noreferrer">مشاهده صفحه ↗</a>' : '') + '<button type="button" id="delete" class="danger">حذف این مورد</button></div>';
  el('editor').innerHTML = fields;
  el('editor').querySelectorAll('input,textarea').forEach(input => {
    input.disabled = readonly || busy;
    if (input.type !== 'file') input.addEventListener('input', markDirty);
  });
  if (readonly || busy) el('editor').querySelectorAll('button').forEach(button => button.disabled = true);
  el('editor').querySelectorAll('[data-upload]').forEach(input => input.onchange = () => upload(input));
  if (section === 'events') {
    for (const type of ['image', 'video']) el('add-' + type).onclick = () => {
      capture(); item.media ||= []; item.media.push({type, url: '', caption: '', ...(type === 'image' ? {alt: ''} : {})}); markDirty(); render();
    };
    el('add-evidence').onclick = () => {
      capture(); item.evidence ||= []; item.evidence.push({title: '', url: ''}); markDirty(); render();
    };
    el('editor').querySelectorAll('[data-media-action]').forEach(button => button.onclick = () => {
      capture(); const index = Number(button.dataset.index), action = button.dataset.mediaAction;
      if (action === 'remove') item.media.splice(index, 1);
      else {
        const next = index + (action === 'up' ? -1 : 1);
        if (next >= 0 && next < item.media.length) [item.media[index], item.media[next]] = [item.media[next], item.media[index]];
      }
      markDirty(); render();
    });
    el('editor').querySelectorAll('[data-evidence-remove]').forEach(button => button.onclick = () => {
      capture(); item.evidence.splice(Number(button.dataset.evidenceRemove), 1); markDirty(); render();
    });
  }
  el('delete').onclick = () => {
    if (confirm('این مورد حذف شود؟')) {
      data[section].splice(selected, 1); selected = Math.min(selected, data[section].length - 1); markDirty(); render();
      setStatus('برای اعمال حذف، دکمه ذخیره در سایت را بزن.');
    }
  };
}

function capture() {
  const item = data[section][selected];
  if (!item) return;
  for (const input of el('editor').querySelectorAll('[data-field]')) {
    const key = input.dataset.field;
    item[key] = input.type === 'checkbox' ? input.checked : ['year', 'order', 'readingMinutes'].includes(key) ? Number(input.value) : input.value;
  }
  if (section === 'events') {
    item.media = Array.from(el('editor').querySelectorAll('.media-row'), row => {
      const entry = {...item.media[Number(row.dataset.index)]};
      row.querySelectorAll('[data-media]').forEach(input => entry[input.dataset.media] = input.value);
      return entry;
    });
    item.evidence = Array.from(el('editor').querySelectorAll('.evidence-row'), row => {
      const entry = {...item.evidence[Number(row.dataset.index)]};
      row.querySelectorAll('[data-evidence]').forEach(input => entry[input.dataset.evidence] = input.value);
      return entry;
    });
  }
}

function lock(value) {
  busy = value;
  el('workspace').querySelectorAll('button,input,textarea').forEach(control => control.disabled = value);
  if (!value) render();
}

async function upload(input) {
  const file = input.files[0];
  if (!file) return;
  const extension = file.name.split('.').pop().toLowerCase();
  const valid = input.dataset.kind === 'image' ? ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'] : ['mp4', 'webm', 'ogv', 'ogg', 'm4v', 'mov'];
  if (!valid.includes(extension) || !file.size || file.size > 25 * 1024 * 1024) {
    setStatus('فرمت فایل را بررسی کن؛ هر فایل باید حداکثر ۲۵ مگابایت باشد.', true); input.value = ''; return;
  }
  capture();
  const item = data[section][selected], target = input.dataset.upload;
  lock(true); setStatus('در حال آماده‌کردن فایل…');
  try {
    const content = bytesBase64(new Uint8Array(await file.arrayBuffer()));
    const path = 'assets/media/' + Date.now() + '-' + crypto.randomUUID().slice(0, 8) + '.' + extension;
    const url = './' + path;
    pendingUploads.set(url, {path, content});
    if (target === 'cover') item.image = url;
    else item.media[Number(target.slice(6))].url = url;
    markDirty(); setStatus('فایل آماده شد. با «ذخیره در سایت» همراه روایت منتشر می‌شود.');
  } catch (error) {
    setStatus('فایل آماده نشد: ' + error.message, true);
  } finally {
    lock(false);
  }
}

function validate(items, key) {
  if (items.some(item => !item.title?.trim())) throw Error('عنوان همه موارد باید تکمیل شود.');
  if (items.some(item => !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(item.id || '')) || new Set(items.map(item => item.id)).size !== items.length) throw Error('شناسه‌ها باید یکتا و شامل حروف انگلیسی، عدد یا خط تیره باشند.');
  for (const item of items) {
    if (item.image && !safeUrl(item.image)) throw Error('نشانی تصویر معتبر نیست: ' + item.title);
    if (key === 'events') {
      if (!Number.isInteger(item.year) || item.year < 1300 || item.year > 1500 || !Number.isFinite(item.order)) throw Error('سال یا ترتیب تجربه معتبر نیست: ' + item.title);
      if ((item.media || []).some(entry => !['image', 'video'].includes(entry.type) || !safeUrl(entry.url))) throw Error('نشانی همه تصویرها و ویدیوها را کامل کن: ' + item.title);
      if ((item.evidence || []).some(entry => !safeUrl(entry.url, false))) throw Error('برای هر شاهد یک لینک کامل https:// وارد کن: ' + item.title);
    }
  }
}

// Save the narrative and its uploads in one commit. A concurrent edit never gets overwritten.
async function saveSection(key) {
  const items = data[key];
  validate(items, key);
  const ref = await request('git/ref/heads/main'), head = ref.object.sha;
  const [commit, current] = await Promise.all([request('git/commits/' + head), request('contents/data/' + key + '.json?ref=' + head)]);
  if (current.sha !== shas[key]) throw Error('این بخش در جای دیگری تغییر کرده است. تغییرات این صفحه هنوز محفوظ‌اند؛ پیش از ذخیره باید نسخه‌ها بررسی شوند.');
  const urls = new Set(items.flatMap(item => [item.image, ...(item.media || []).map(entry => entry.url)]));
  const uploads = [...pendingUploads.entries()].filter(([url]) => urls.has(url));
  const entries = [];
  for (const [, file] of uploads) {
    const blob = await post('git/blobs', {content: file.content, encoding: 'base64'});
    entries.push({path: file.path, mode: '100644', type: 'blob', sha: blob.sha});
  }
  const blob = await post('git/blobs', {content: JSON.stringify(items, null, 2) + '\n', encoding: 'utf-8'});
  entries.push({path: 'data/' + key + '.json', mode: '100644', type: 'blob', sha: blob.sha});
  const tree = await post('git/trees', {base_tree: commit.tree.sha, tree: entries});
  const saved = await post('git/commits', {message: 'Update ' + key + ' and media via website admin', tree: tree.sha, parents: [head]});
  await request('git/refs/heads/main', {method: 'PATCH', body: JSON.stringify({sha: saved.sha, force: false})});
  shas[key] = blob.sha;
  dirtySections.delete(key);
  uploads.forEach(([url]) => pendingUploads.delete(url));
}

el('connect').onclick = async () => {
  token = el('token').value.trim();
  if (!token) { alert('توکن را وارد کن.'); return; }
  readonly = false;
  try {
    await load(); el('token').value = ''; el('login').classList.add('hidden'); el('workspace').classList.remove('hidden');
    setStatus('متصل شدی. تغییرات پس از ذخیره به سایت می‌روند.');
  } catch (error) { token = ''; alert('اتصال ناموفق: ' + error.message); }
};
el('readonly').onclick = async () => {
  token = ''; readonly = true;
  try {
    await load(); el('login').classList.add('hidden'); el('workspace').classList.remove('hidden');
    setStatus('حالت مشاهده؛ برای ویرایش باید متصل شوی.');
  } catch (error) { alert(error.message); }
};
for (const key of ['events', 'notes']) el('tab-' + key).onclick = () => {
  capture(); section = key; selected = data[key].length ? 0 : -1; render();
  setStatus(dirtySections.has(key) ? 'تغییرات این بخش هنوز ذخیره نشده‌اند.' : '');
};
el('new').onclick = () => {
  capture();
  data[section].unshift(section === 'events' ? {id: 'e-' + crypto.randomUUID(), year: Number(new Intl.DateTimeFormat('en-u-ca-persian', {year: 'numeric'}).format(new Date())), order: 1, title: 'تجربه جدید', description: '', body: '', image: '', imageAlt: '', media: [], evidence: [], published: false} : {id: 'new-' + Date.now(), date: new Date().toISOString().slice(0, 10), title: 'یادداشت جدید', description: '', readingMinutes: 5, image: '', body: '', published: false});
  selected = 0; markDirty(); render(); setStatus('مورد جدید ساخته شد؛ پس از تکمیل ذخیره کن.');
};
el('save').onclick = async () => {
  if (readonly || busy) return;
  capture(); const key = section;
  lock(true); setStatus('در حال ذخیره روایت و فایل‌ها…');
  try {
    await saveSection(key);
    setStatus('ذخیره شد. چند دقیقه بعد سایت به‌روز می‌شود.' + (dirtySections.size ? ' بخش دیگر هنوز تغییرات ذخیره‌نشده دارد.' : ''));
  } catch (error) { setStatus('ذخیره نشد: ' + error.message, true); }
  finally { lock(false); }
};
el('logout').onclick = () => {
  if (dirtySections.size && !confirm('تغییرات ذخیره‌نشده کنار گذاشته شوند؟')) return;
  token = ''; data = {events: [], notes: []}; shas = {}; dirtySections.clear(); pendingUploads.clear();
  el('workspace').classList.add('hidden'); el('login').classList.remove('hidden'); el('token').value = '';
};
window.addEventListener('beforeunload', event => {
  if (dirtySections.size || busy) { event.preventDefault(); event.returnValue = ''; }
});
