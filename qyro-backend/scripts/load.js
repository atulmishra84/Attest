const http = require('http');

const total = Number(process.env.LOAD_REQUESTS || 200);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 20);
let completed = 0;
let failed = 0;
const started = Date.now();

function once() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode >= 500) failed += 1;
        completed += 1;
        resolve();
      });
    });
    req.on('error', () => {
      failed += 1;
      completed += 1;
      resolve();
    });
  });
}

async function main() {
  let inflight = 0;
  let sent = 0;
  await new Promise((resolve) => {
    function pump() {
      while (inflight < concurrency && sent < total) {
        sent += 1;
        inflight += 1;
        once().then(() => {
          inflight -= 1;
          if (completed >= total) resolve();
          else pump();
        });
      }
    }
    pump();
  });
  const seconds = (Date.now() - started) / 1000;
  console.log(JSON.stringify({
    requests: total,
    failed,
    seconds: Number(seconds.toFixed(2)),
    rps: Number((total / seconds).toFixed(1)),
  }));
  if (failed > total * 0.01) process.exit(1);
}

main();
