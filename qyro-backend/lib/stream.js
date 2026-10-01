const clients = new Set();

function subscribe(res) {
  clients.add(res);
  res.write(': connected\n\n');
  return () => clients.delete(res);
}

function publish(event) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

module.exports = { subscribe, publish };
