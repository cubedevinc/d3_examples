// generate-auth-token.js
// Usage: D3_MCP_AGENT_SECRET=your_secret node generate-auth-token.js

const jwt = require('jsonwebtoken');

const secret = process.env.D3_MCP_AGENT_SECRET;
const url = process.env.D3_MCP_AGENT_URL;

if (!secret) {
  console.error('Error: D3_MCP_AGENT_SECRET environment variable is required.');
  process.exit(1);
}

const payload = {
  sub: 'claude-desktop',
  iat: Math.floor(Date.now() / 1000),
  context: {
    user: 'claude-desktop',
  },
};

const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '24h' });

console.log(token); 