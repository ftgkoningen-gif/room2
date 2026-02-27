import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Args: node serve.mjs [rootDir=.] [port=8080]
// Examples:
//   node serve.mjs                        → serves workspace root on :8080
//   node serve.mjs . 3000                 → serves cwd on :3000
//   node serve.mjs apps/roomto 3000       → serves roomto on :3000
const rootDir = process.argv[2]
  ? resolve(process.argv[2])
  : __dirname;
const PORT = parseInt(process.argv[3]) || 8080;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.pdf':  'application/pdf',
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = join(rootDir, urlPath === '/' ? 'index.html' : urlPath);

  try {
    const data = await readFile(filePath);
    const ext  = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type':  mime[ext] || 'text/plain',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => {
  console.log(`Serving ${rootDir} on http://localhost:${PORT}`);
});
