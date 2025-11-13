const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration from environment variables
const TENANT_NAME = process.env.CUBE_TENANT_NAME;
const AGENT_ID = process.env.CUBE_AGENT_ID;
const API_KEY = process.env.CUBE_API_KEY;
const CHAT_ID = `chat-${Date.now()}`;

// API URLs - can be overridden for local development
const CUBE_API_URL = process.env.CUBE_API_URL || `https://${TENANT_NAME}.cubecloud.dev`;
const AI_ENGINEER_URL = process.env.AI_ENGINEER_URL || 'https://ai-engineer.cubecloud.dev';

// Parse URLs to extract protocol and host
const cubeApiUrl = new URL(CUBE_API_URL);
const aiEngineerUrl = new URL(AI_ENGINEER_URL);

// Helper to get the appropriate protocol module
function getProtocol(url) {
  return url.protocol === 'https:' ? https : http;
}

// Validate required environment variables
if (!TENANT_NAME || !AGENT_ID || !API_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Please set: CUBE_TENANT_NAME, CUBE_AGENT_ID, CUBE_API_KEY');
  process.exit(1);
}

// Step 1: Generate Session
function generateSession(externalId = 'user@example.com', userAttributes = []) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      externalId,
      userAttributes
    });

    const options = {
      hostname: cubeApiUrl.hostname,
      port: cubeApiUrl.port,
      path: '/api/v1/embed/generate-session',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${API_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = getProtocol(cubeApiUrl).request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const { sessionId } = JSON.parse(body);
          resolve(sessionId);
        } else {
          reject(new Error(`Session generation failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Step 2: Get Token
function getToken(sessionId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sessionId });

    const options = {
      hostname: cubeApiUrl.hostname,
      port: cubeApiUrl.port,
      path: '/api/v1/embed/session/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${API_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = getProtocol(cubeApiUrl).request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const { token } = JSON.parse(body);
          resolve(token);
        } else {
          reject(new Error(`Token retrieval failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Step 3: Stream Chat
function streamChat(token, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chatId: CHAT_ID,
      input: message
    });

    const options = {
      hostname: aiEngineerUrl.hostname,
      port: aiEngineerUrl.port,
      path: `/api/v1/public/${TENANT_NAME}/agents/${AGENT_ID}/chat/stream-chat-state`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': data.length
      }
    };

    const req = getProtocol(aiEngineerUrl).request(options, (res) => {
      console.log(`\nStatus: ${res.statusCode}\n`);

      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());

        lines.forEach(line => {
          try {
            const parsed = JSON.parse(line);

            // Debug: log the raw parsed object
            if (process.env.DEBUG) {
              console.log('\n[DEBUG]', JSON.stringify(parsed, null, 2));
            }

            // Display assistant responses
            if (parsed.role === 'assistant' && parsed.content) {
              if (parsed.isDelta) {
                process.stdout.write(parsed.content);
              } else if (!parsed.isInProcess) {
                console.log('\n');
              }
            }

            // Display thinking process
            if (parsed.thinking) {
              console.log(`\n[Thinking] ${parsed.thinking}`);
            }

            // Display tool calls
            if (parsed.toolCall) {
              console.log(`\n[Tool Call] ${parsed.toolCall.name}`);
              if (parsed.toolCall.input) {
                console.log(`  Input: ${JSON.stringify(parsed.toolCall.input)}`);
              }
              if (parsed.toolCall.output) {
                console.log(`  Output: ${JSON.stringify(parsed.toolCall.output)}`);
              }
            }
          } catch (e) {
            // Log parse errors in debug mode
            if (process.env.DEBUG) {
              console.error('\n[DEBUG] Parse error:', e.message);
              console.error('[DEBUG] Line:', line);
            }
          }
        });
      });

      res.on('end', () => {
        console.log('\n\nStream completed');
        resolve();
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Main execution
async function main() {
  try {
    console.log('Generating session...');
    const sessionId = await generateSession();
    console.log(`Session ID: ${sessionId}`);

    console.log('\nGetting token...');
    const token = await getToken(sessionId);
    console.log('Token obtained');

    console.log('\nStarting chat...');
    const message = process.argv[2] || 'What is the total revenue?';
    console.log(`User: ${message}\n`);

    await streamChat(token, message);
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nConnection refused. Please ensure:');
      console.error(`  - Cube API is running at: ${CUBE_API_URL}`);
      console.error(`  - AI Engineer is running at: ${AI_ENGINEER_URL}`);
    }
    process.exit(1);
  }
}

main();
