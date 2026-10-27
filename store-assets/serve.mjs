import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const server = http.createServer((request, response) => {
  const fileName = path.basename(new URL(request.url, 'http://localhost').pathname);
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': fileName.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(8765, '127.0.0.1', () => {
  console.log('store asset server listening on 8765');
});
