// Minimal static file server for e2e tests. Serves dist/, the output of
// `npm run build` (index.html plus the app.js bundle), so tests exercise the
// exact files GitHub Pages deploys. Nothing bundles src/*.ts on the fly:
// rebuild before testing or the run sees a stale dist/.

import { createServer, Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'dist');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
};

export interface StaticServer {
  url: string;
  close(): Promise<void>;
}

// Serves the repo root on an ephemeral port and resolves once listening.
export function serveApp(): Promise<StaticServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0];
      const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      readFile(filePath).then(
        body => {
          const ext = path.extname(filePath);
          res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' });
          res.end(body);
        },
        () => {
          res.writeHead(404).end('Not found');
        }
      );
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>(res => server.close(() => res())),
      });
    });
  });
}
