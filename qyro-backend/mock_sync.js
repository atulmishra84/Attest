require('dotenv').config();
const http = require('http');

const payload = JSON.stringify({
  agents: [
    {
      id: 'mock-agent-001',
      name: 'Clinical Document Analyzer',
      source: 'External AgentRadar Engine',
      status: 'Active'
    },
    {
      id: 'mock-agent-002',
      name: 'Billing Support Bot',
      source: 'External AgentRadar Engine',
      status: 'Paused'
    },
    {
      id: 'mock-agent-003',
      name: 'Patient Scheduling Assistant',
      source: 'External AgentRadar Engine',
      status: 'Active'
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/integration/agentradar/sync',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-API-Key': process.env.INTEGRATION_API_KEY || 'qyro-integration-key-dev',
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${data}`);
  });
});

req.on('error', (error) => {
  console.error('Error simulating sync request:', error);
});

req.write(payload);
req.end();

console.log('Simulating AgentRadar discovering 3 new agents and POSTing them to the Attest webhook...');
