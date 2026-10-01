const crypto = require('crypto');
const logger = require('./logger');

function startSpan(name) {
  const traceId = crypto.randomBytes(16).toString('hex');
  const spanId = crypto.randomBytes(8).toString('hex');
  const started = process.hrtime.bigint();
  return {
    traceId,
    spanId,
    name,
    async end(statusCode) {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      if (!endpoint) return { traceId, durationMs };
      const body = {
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'qyro-assurance' } }] },
          scopeSpans: [{
            spans: [{
              traceId,
              spanId,
              name,
              startTimeUnixNano: String(started),
              endTimeUnixNano: String(process.hrtime.bigint()),
              attributes: [{ key: 'http.status_code', value: { intValue: statusCode || 0 } }],
            }],
          }],
        }],
      };
      fetch(endpoint.replace(/\/$/, '') + '/v1/traces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((err) => logger.warn({ err: err.message }, 'trace export failed'));
      return { traceId, durationMs };
    },
  };
}

module.exports = { startSpan };
