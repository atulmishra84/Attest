const logger = require('./logger');
const { publish } = require('./stream');
const { driftAlerts } = require('./metrics');

async function emitAlert(alert) {
  driftAlerts.inc();
  publish({ type: 'drift', ...alert });
  logger.warn({ alert }, 'drift detected');
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: alert.message, alert }),
  }).catch((err) => logger.error({ err: err.message }, 'alert webhook failed'));
}

module.exports = { emitAlert };
