// Static file server for development. Node only, no dependencies.
//
// It exists for one reason: browsers cache ES modules hard, and a plain
// python http.server will happily hand back yesterday's main.js after an edit.
// Everything here goes out with no-store so a reload is always a real reload.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2]) || 8000;
const root = process.cwd();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  // Decoded, so a folder with a space in its name is reachable. The reference
  // art lives in one, and without this every request for it came back 404.
  const path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

  // Strip any ../ before joining, so a request can never climb out of the repo.
  const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));

  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
