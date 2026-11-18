import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { excellenceFixture } from './fixture.js';
const fixture = await excellenceFixture();
let queue = Promise.resolve();
const allowedFiles = new Map([
 ['/', ['tests/excellence/preview.html', 'text/html']],
 ['/tests/excellence/preview.js', ['tests/excellence/preview.js', 'text/javascript']],
 ['/src/excellence/view.js', ['src/excellence/view.js', 'text/javascript']],
 ['/src/excellence/scoring.js', ['src/excellence/scoring.js', 'text/javascript']]
]);
createServer(async (req, res) => {
 res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
 try {
  if (req.url === '/rpc' && req.method === 'POST') {
   if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4189') { res.writeHead(403).end(); return; }
   let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 12000) throw Error('Pedido grande demais.'); }
   const request = JSON.parse(body); if (!['op', 'sup', 'admin'].includes(request.actor)) throw Error('Perfil sintético inválido.');
   const operation = queue.then(async () => { await fixture.asActor(request.actor); return fixture.rpc(request.action, request.data); });
   queue = operation.catch(() => {}); const result = await operation;
   res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result)); return;
  }
  const file = allowedFiles.get(req.url); if (!file || req.method !== 'GET') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' }).end(await readFile(new URL('../../' + file[0], import.meta.url)));
 } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message })); }
}).listen(4189, '127.0.0.1', () => process.stdout.write('Prévia PostgreSQL sintética: http://127.0.0.1:4189/\n'));
