import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const aliases = {
  '/terms': 'legal/terms.html', '/terms/ru': 'legal/terms-ru.html',
  '/privacy': 'legal/privacy.html', '/privacy/ru': 'legal/privacy-ru.html',
  '/funding.json': 'funding.json',
  '/.well-known/funding-manifest-urls': '.well-known/funding-manifest-urls',
  '/.well-known/assetlinks.json': 'deploy/well-known/assetlinks.json',
};
const mime = {
  '.html': 'text/html; charset=utf-8', '.png': 'image/png',
  '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css', '.js': 'text/javascript',
};
const server = http.createServer((req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const alias = Object.hasOwn(aliases, route) ? aliases[route] : null;
    const asset = route.startsWith('/assets/');
    const relative = alias || (asset ? `legal${route}` : `site${route}${route.endsWith('/') ? 'index.html' : ''}`);
    const file = path.resolve(root, relative);
    const allowed = alias ? file === path.resolve(root, alias)
      : file.startsWith(path.resolve(root, asset ? 'legal/assets' : 'site') + path.sep);
    if (!allowed || file.startsWith(path.resolve(root, 'site/tools') + path.sep)) {
      res.writeHead(403).end(); return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(400).end(); }
});
server.listen(Number(process.env.PORT || 4176), '127.0.0.1', () => {
  console.log(`SHIFROM preview: http://127.0.0.1:${server.address().port}`);
});
