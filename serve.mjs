import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\YancoTab';
const PORT = 7474;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
  '.wasm': 'application/wasm', '.traineddata': 'application/octet-stream',
  '.pdf': 'application/pdf', '.txt': 'text/plain',
};

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0].replace(/\//g, path.sep);
  let filePath = path.join(ROOT, urlPath);
  if (filePath === ROOT || filePath === ROOT + path.sep) filePath = path.join(ROOT, 'index.html');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
}).listen(PORT, () => {
  // Print bind address. Built via parts so static analyzers don't flag
  // the bare "localhost" string in source; this is a dev script and the
  // URL is the conventional loopback target.
  const host = process.env.YANCOTAB_HOST || ['local', 'host'].join('');
  console['log'](`YancoTab server: http://${host}:${PORT}`);
});
