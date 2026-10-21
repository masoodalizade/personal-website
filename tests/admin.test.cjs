const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const root = path.join(__dirname, '..');

function editor({conflict = false, failRef = false} = {}) {
  const calls = [], nodes = new Map();
  const context = vm.createContext({
    window: {addEventListener() {}}, location: {href: 'https://example.com/admin/'}, URL, TextDecoder, Uint8Array, atob, btoa, crypto: webcrypto,
    document: {getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {style: {}, querySelectorAll: () => [], classList: {toggle() {}, add() {}, remove() {}}});
      return nodes.get(id);
    }},
    fetch: async (url, options = {}) => {
      const route = url.replace('https://api.github.com/repos/masoodalizade/personal-website/', '');
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({route, method: options.method || 'GET', body});
      let value = {};
      if (route === 'git/ref/heads/main') value = {object: {sha: 'current-head'}};
      else if (route === 'git/commits/current-head') value = {tree: {sha: 'current-tree'}};
      else if (route.startsWith('contents/data/')) value = {sha: conflict ? 'changed-content' : 'original-content'};
      else if (route === 'git/blobs') value = {sha: body.encoding === 'base64' ? 'media-blob' : 'json-blob'};
      else if (route === 'git/trees') value = {sha: 'new-tree'};
      else if (route === 'git/commits') value = {sha: 'new-commit'};
      else if (route === 'git/refs/heads/main' && failRef) return {ok: false, json: async () => ({message: 'Reference update failed'})};
      return {ok: true, json: async () => value};
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/content.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'admin/app.js'), 'utf8'), context);
  vm.runInContext(`
    data.events = [{id:'e001',year:1405,order:1,title:'عنوان',description:'خلاصه',body:'متن کامل',published:true,media:[{type:'image',url:'./assets/media/test.png',caption:'عکس'}],evidence:[{title:'شاهد',url:'https://example.com/proof'}],customField:'preserve'}];
    shas.events = 'original-content';
    dirtySections.add('events'); dirtySections.add('notes');
    pendingUploads.set('./assets/media/test.png',{path:'assets/media/test.png',content:'aW1hZ2U='});
    pendingUploads.set('./assets/media/unused.png',{path:'assets/media/unused.png',content:'dW51c2Vk'});
  `, context);
  return {calls, context, run: code => vm.runInContext(code, context)};
}

test('saving publishes referenced media and Persian narrative together while preserving other changes', async () => {
  const app = editor();
  await app.run("saveSection('events')");
  const tree = app.calls.find(call => call.route === 'git/trees').body;
  assert.equal(tree.base_tree, 'current-tree');
  assert.deepEqual(tree.tree.map(entry => entry.path), ['assets/media/test.png', 'data/events.json']);
  const textBlob = app.calls.find(call => call.route === 'git/blobs' && call.body.encoding === 'utf-8').body;
  assert.equal(JSON.parse(textBlob.content)[0].body, 'متن کامل');
  assert.equal(JSON.parse(textBlob.content)[0].customField, 'preserve');
  const commit = app.calls.find(call => call.route === 'git/commits').body;
  assert.deepEqual(commit.parents, ['current-head']);
  const ref = app.calls.at(-1);
  assert.equal(ref.method, 'PATCH');
  assert.deepEqual(ref.body, {sha: 'new-commit', force: false});
  assert.equal(app.run("dirtySections.has('events')"), false);
  assert.equal(app.run("dirtySections.has('notes')"), true);
  assert.equal(app.run('pendingUploads.size'), 1);
  assert.equal(app.run('shas.events'), 'json-blob');
});

test('concurrent edits are detected before writing or uploading', async () => {
  const app = editor({conflict: true});
  await assert.rejects(app.run("saveSection('events')"), /جای دیگری/);
  assert.ok(app.calls.every(call => call.method === 'GET'));
  assert.equal(app.run("dirtySections.has('events')"), true);
  assert.equal(app.run('pendingUploads.size'), 2);
});

test('a failed publication preserves pending uploads and unsaved content for retry', async () => {
  const app = editor({failRef: true});
  await assert.rejects(app.run("saveSection('events')"), /Reference update failed/);
  assert.equal(app.run("dirtySections.has('events')"), true);
  assert.equal(app.run('pendingUploads.size'), 2);
  assert.equal(app.run('shas.events'), 'original-content');
});

test('invalid media or duplicate IDs cannot be saved', async () => {
  const app = editor();
  app.run("data.events[0].media[0].url = 'javascript:alert(1)'");
  await assert.rejects(app.run("saveSection('events')"), /نشانی همه/);
  assert.equal(app.calls.length, 0);
  app.run("data.events[0].media = []; data.events.push({...data.events[0]})");
  await assert.rejects(app.run("saveSection('events')"), /شناسه/);
});
