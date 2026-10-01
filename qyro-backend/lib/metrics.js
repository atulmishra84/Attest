const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: 'qyro_http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpDuration = new client.Histogram({
  name: 'qyro_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3],
  registers: [register],
});

const opaDuration = new client.Histogram({
  name: 'qyro_opa_evaluation_seconds',
  help: 'OPA evaluation time',
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

const driftAlerts = new client.Counter({
  name: 'qyro_drift_alerts_total',
  help: 'Drift alerts emitted',
  registers: [register],
});

function observeRequest(method, route, status, seconds) {
  httpRequests.inc({ method, route, status });
  httpDuration.observe({ method, route, status }, seconds);
}

module.exports = { register, observeRequest, opaDuration, driftAlerts };
