import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * Client for interacting with Cube's AI Agent API
 */
export class CubeAgentClient {
  /**
   * Create a new CubeAgentClient
   * @param {Object} config - Configuration options
   * @param {string} config.tenantName - Cube tenant name
   * @param {string|number} config.agentId - AI agent ID
   * @param {string} config.apiKey - Cube API key
   * @param {string} [config.cubeApiUrl] - Optional Cube API URL (defaults to https://{tenantName}.cubecloud.dev)
   * @param {string} [config.aiEngineerUrl] - Optional AI Engineer URL (defaults to https://ai-engineer.cubecloud.dev)
   * @param {string} [config.chatId] - Optional chat ID (defaults to auto-generated)
   */
  constructor(config) {
    this.tenantName = config.tenantName;
    this.agentId = config.agentId;
    this.apiKey = config.apiKey;
    this.chatId = config.chatId || `chat-${Date.now()}`;

    // Parse API URLs
    const cubeApiUrlString = config.cubeApiUrl || `https://${config.tenantName}.cubecloud.dev`;
    const aiEngineerUrlString = config.aiEngineerUrl || 'https://ai-engineer.cubecloud.dev';

    this.cubeApiUrl = new URL(cubeApiUrlString);
    this.aiEngineerUrl = new URL(aiEngineerUrlString);

    // Cache for session and token
    this._sessionId = null;
    this._token = null;
  }

  /**
   * Get the appropriate protocol module (http or https)
   * @private
   */
  _getProtocol(url) {
    return url.protocol === 'https:' ? https : http;
  }

  /**
   * Generate a new session
   * @param {string} [externalId='user@example.com'] - External user ID
   * @param {Array} [userAttributes=[]] - User attributes
   * @returns {Promise<string>} Session ID
   */
  async generateSession(externalId = 'user@example.com', userAttributes = []) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        externalId,
        userAttributes
      });

      const options = {
        hostname: this.cubeApiUrl.hostname,
        port: this.cubeApiUrl.port,
        path: '/api/v1/embed/generate-session',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Api-Key ${this.apiKey}`,
          'Content-Length': data.length
        }
      };

      const req = this._getProtocol(this.cubeApiUrl).request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const { sessionId } = JSON.parse(body);
            this._sessionId = sessionId;
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

  /**
   * Get authentication token for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<string>} Authentication token
   */
  async getToken(sessionId) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ sessionId });

      const options = {
        hostname: this.cubeApiUrl.hostname,
        port: this.cubeApiUrl.port,
        path: '/api/v1/embed/session/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Api-Key ${this.apiKey}`,
          'Content-Length': data.length
        }
      };

      const req = this._getProtocol(this.cubeApiUrl).request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const { token } = JSON.parse(body);
            this._token = token;
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

  /**
   * Ensure the client is authenticated (generates session and token if needed)
   * @private
   */
  async _ensureAuthenticated() {
    if (!this._token) {
      this._sessionId = await this.generateSession();
      this._token = await this.getToken(this._sessionId);
    }
    return this._token;
  }

  /**
   * Get the raw HTTP response stream for server-side proxying
   * This is useful for Next.js API routes that need to stream responses to the client
   * @param {string} message - User message
   * @param {Object} [body] - Additional request body fields
   * @returns {Promise<http.IncomingMessage>} Raw HTTP response stream
   */
  async getRawChatStream(message, body = {}) {
    const token = await this._ensureAuthenticated();

    const data = JSON.stringify({
      chatId: this.chatId,
      input: message,
      ...body
    });

    const requestOptions = {
      hostname: this.aiEngineerUrl.hostname,
      port: this.aiEngineerUrl.port,
      path: `/api/v1/public/${this.tenantName}/agents/${this.agentId}/chat/stream-chat-state`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': data.length
      }
    };

    return new Promise((resolve, reject) => {
      const req = this._getProtocol(this.aiEngineerUrl).request(requestOptions, (res) => {
        // Return the response object for streaming
        resolve(res);
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Stream chat responses from the AI agent
   * @param {string} message - User message
   * @param {Object} [options] - Stream options
   * @param {Function} [options.onChunk] - Callback for each chunk
   * @param {Function} [options.onThinking] - Callback for thinking events
   * @param {Function} [options.onToolCall] - Callback for tool call events
   * @returns {Promise<Array>} Promise that resolves to array of all events
   */
  async streamChat(message, options = {}) {
    const token = await this._ensureAuthenticated();

    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        chatId: this.chatId,
        input: message
      });

      const requestOptions = {
        hostname: this.aiEngineerUrl.hostname,
        port: this.aiEngineerUrl.port,
        path: `/api/v1/public/${this.tenantName}/agents/${this.agentId}/chat/stream-chat-state`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': data.length
        }
      };

      const req = this._getProtocol(this.aiEngineerUrl).request(requestOptions, (res) => {
        const events = [];

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());

          lines.forEach(line => {
            try {
              const parsed = JSON.parse(line);
              events.push(parsed);

              // Call option callbacks
              if (parsed.role === 'assistant' && parsed.content && parsed.isDelta && options.onChunk) {
                options.onChunk(parsed.content);
              }
              if (parsed.thinking && options.onThinking) {
                options.onThinking(parsed.thinking);
              }
              if (parsed.toolCall && options.onToolCall) {
                options.onToolCall(parsed.toolCall);
              }
            } catch (e) {
              // Ignore parse errors
            }
          });
        });

        res.on('end', () => {
          resolve(events);
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Send a chat message and get the complete response
   * @param {string} message - User message
   * @returns {Promise<string>} Complete assistant response
   */
  async chat(message) {
    const events = await this.streamChat(message);

    // Collect all content chunks
    const contentChunks = events
      .filter(event => event.role === 'assistant' && event.content && event.isDelta)
      .map(event => event.content);

    return contentChunks.join('');
  }

  /**
   * Get detailed response including thinking and tool calls
   * @param {string} message - User message
   * @returns {Promise<Object>} Structured response with content, thinking, and tool calls
   */
  async chatDetailed(message) {
    const events = await this.streamChat(message);

    const response = {
      content: '',
      thinking: [],
      toolCalls: [],
      rawEvents: events
    };

    events.forEach(event => {
      if (event.role === 'assistant' && event.content && event.isDelta) {
        response.content += event.content;
      }
      if (event.thinking) {
        response.thinking.push(event.thinking);
      }
      if (event.toolCall) {
        response.toolCalls.push(event.toolCall);
      }
    });

    return response;
  }
}
