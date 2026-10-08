import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const root = new URL('../../', import.meta.url);
const pages = ['/', '/about.html', '/roadmap.html', '/donate.html', '/writeups/', '/writeups/how-phantom-survives-dpi.html'];
const routes = pages.flatMap(route => [route, `/ru${route}`]);
let server;
let base;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('./preview.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { server.kill(); reject(new Error('Preview did not start')); }, 10000);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited: ${code}`)); });
    server.stdout.on('data', bytes => {
      output += bytes.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
});

after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const closed = once(server, 'close');
    server.kill();
    await closed;
  }
});

async function exact(route, file) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(new URL(file, root)), route);
}

test('all twelve pages serve exact bytes', async () => {
  for (const route of routes) await exact(route, `site${route}${route.endsWith('/') ? 'index.html' : ''}`);
});

test('separately served public resources and query-versioned images', async () => {
  const resources = {
    '/terms': 'legal/terms.html', '/terms/ru': 'legal/terms-ru.html',
    '/privacy': 'legal/privacy.html', '/privacy/ru': 'legal/privacy-ru.html',
    '/funding.json': 'funding.json', '/.well-known/funding-manifest-urls': '.well-known/funding-manifest-urls',
    '/.well-known/assetlinks.json': 'deploy/well-known/assetlinks.json',
    '/sitemap.xml': 'site/sitemap.xml', '/robots.txt': 'site/robots.txt',
    '/static/logo-mark.png?v=bc5ceee9': 'site/static/logo-mark.png',
    '/static/shifrom-wordmark-white.png': 'site/static/shifrom-wordmark-white.png',
    '/static/shifrom-social-132f0f6a.png': 'site/static/shifrom-social-132f0f6a.png',
  };
  for (const [route, file] of Object.entries(resources)) await exact(route, file);
});

test('HEAD preserves headers without returning a body', async () => {
  const response = await fetch(base + '/ru/', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('rejects traversal and development source access', async () => {
  for (const route of ['/assets/..%2F..%2FREADME.md', '/tools/preview.mjs', '/tools/preview.test.mjs']) {
    assert.equal((await fetch(base + route)).status, 403, route);
  }
});

test('unknown, malformed and unsupported requests fail explicitly', async () => {
  assert.equal((await fetch(base + '/missing-file.html')).status, 404);
  assert.equal((await fetch(base + '/%ZZ')).status, 400);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
});
