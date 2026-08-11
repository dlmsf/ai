import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { writeFileSync, existsSync } from 'fs';
import EasyAI from '../EasyAI.js';
import Chat from './ChatModule/Chat.js';
import PM2 from './useful/PM2.js';
import ChatView from './ChatView.js'
import { promisify } from 'util';
import { networkInterfaces } from 'os';
import FreePort from './useful/FreePort.js';
import crypto from 'crypto';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

class EasyAI_WebGPT {
  static instance = null;

  constructor(config = {handle_port : true}) {
    if (EasyAI_WebGPT.instance) return EasyAI_WebGPT.instance;

    this.handle_port = config.handle_port || true
    this.port = config.port || 3000;
    
    // Store the token for later use in requests
    this.easyai_token = config.easyai_token || null;
    
    // Session store - each session has its own Chat and messages array
    this.sessions = new Map();
    
    // Session cleanup - remove old sessions after 30 minutes of inactivity
    this.SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.lastActivity > this.SESSION_TIMEOUT) {
          this.sessions.delete(sessionId);
          console.log(`Session ${sessionId} expired and removed`);
        }
      }
    }, 60 * 1000); // Check every minute
    
    // Build the config for EasyAI based on what's provided
    const easyAIConfig = {};
    
    // If we have OpenAI token, use that
    if (config.openai_token) {
      easyAIConfig.openai_token = config.openai_token;
      easyAIConfig.openai_model = config.openai_model;
    }
    // If we have DeepInfra token, use that
    else if (config.deepinfra_token) {
      easyAIConfig.deepinfra_token = config.deepinfra_token;
      easyAIConfig.deepinfra_model = config.deepinfra_model;
    }
    // If we have DeepSeek token, use that
    else if (config.deepseek_token) {
      easyAIConfig.deepseek_token = config.deepseek_token;
      easyAIConfig.deepseek_model = config.deepseek_model;
    }
    // If we have NovitaAI token, use that
    else if (config.novitaai_token) {
      easyAIConfig.novitaai_token = config.novitaai_token;
      easyAIConfig.novitaai_model = config.novitaai_model;
    }
    
    // If we have server URL, use that (with token if provided)
    if (config.easyai_url) {
      easyAIConfig.server_url = config.easyai_url;
      easyAIConfig.server_port = config.easyai_port || 4000;
      // IMPORTANT: Pass the token to the EasyAI instance
      if (this.easyai_token) {
        easyAIConfig.server_token = this.easyai_token;
      }
    }
    
    console.log('EasyAI WebGPT config:', { 
      hasOpenAI: !!config.openai_token, 
      hasDeepInfra: !!config.deepinfra_token,
      hasDeepSeek: !!config.deepseek_token,
      hasNovitaAI: !!config.novitaai_token,
      hasServerURL: !!config.easyai_url,
      hasToken: !!this.easyai_token
    });
    
    this.AI = new EasyAI(easyAIConfig);

    // Optional: Set system message type
    this.systemType = config.systemType || null;

    this.server = http.createServer(async (req, res) => {
      // Add CORS headers for all responses
      const setCORSHeaders = (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, X-Session-Id');
      };

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        setCORSHeaders(res);
        res.writeHead(200);
        res.end();
        return;
      }

      setCORSHeaders(res);

      if (req.method === 'GET' && req.url === '/') { 
        try {
          // 1. Create temporary file with ChatView.Html() content
          const tempFilePath = path.join(process.cwd(), 'temp_chat.html');
          
          // Generate a unique session ID and inject it into the HTML
          const sessionId = crypto.randomBytes(16).toString('hex');
          let htmlContent = ChatView.Html();
          
          // Inject session ID into the HTML so the frontend can use it
          htmlContent = htmlContent.replace('</head>', `
            <script>
              // Store session ID for all subsequent requests
              window.SESSION_ID = '${sessionId}';
              // Override fetch to include session ID in all POST requests
              const originalFetch = window.fetch;
              window.fetch = function(url, options = {}) {
                if (options.method === 'POST') {
                  options.headers = options.headers || {};
                  options.headers['X-Session-Id'] = window.SESSION_ID;
                }
                return originalFetch.call(this, url, options);
              };
            </script>
          </head>`);
          
          await writeFile(tempFilePath, htmlContent, 'utf8');
          
          // Create the session immediately
          this.getOrCreateSession(sessionId);
          
          // 4. Read and serve the file
          fs.readFile(tempFilePath, 'utf8', async (err, content) => {
              try {
                  // 5. Delete the temp file after sending response
                  await unlink(tempFilePath).catch(console.error);
                  
                  if (err) {
                      res.writeHead(500);
                      return res.end('Server Error');
                  }
                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end(content);
              } catch (cleanupError) {
                  console.error('Cleanup error:', cleanupError);
              }
          });
      } catch (setupError) {
          console.error('Setup error:', setupError);
          res.writeHead(500);
          res.end('Server Error');
      }
      } else if (req.method === 'POST' && req.url === '/message') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const { message } = JSON.parse(body);
            
            // Get session ID from header
            const sessionId = req.headers['x-session-id'];
            if (!sessionId) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No session ID provided' }));
              return;
            }
            
            // Get or create session
            const session = this.getOrCreateSession(sessionId);
            
            // Add user message to session
            session.messages.push({ role: 'user', content: message });

            // Build messages array for AI
            const messagesForAI = session.messages.map(msg => ({
              role: msg.role,
              content: msg.content
            }));

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });

            // Store the complete response as we build it
            let fullResponse = '';

            // Determine if we need to pass any special flags based on what we're using
            const chatConfig = {
              tokenCallback: async (token) => {
                try {
                  // Extract content
                  let content = '';
                  
                  if (typeof token === 'string') {
                    content = token;
                  } else if (token?.stream?.content) {
                    content = token.stream.content;
                  } else if (token?.content) {
                    content = token.content;
                  } else {
                    return; // Skip unknown formats
                  }
                  
                  if (content) {
                    // Accumulate for history
                    fullResponse += content;
                    
                    // Send token immediately to frontend
                    res.write(`data: ${JSON.stringify({content: content})}\n\n`);
                  }
                } catch (error) {
                  console.error('Error in tokenCallback:', error);
                }
              },
              stream: true,
              systemType: this.systemType
            };
            
            // Add openai/deepinfra/deepseek/novitaai flags only if those tokens exist
            if (config.openai_token) {
              chatConfig.openai = true;
            } else if (config.deepinfra_token) {
              chatConfig.deepinfra = true;
            } else if (config.deepseek_token) {
              chatConfig.deepseek = true;
            } else if (config.novitaai_token) {
              chatConfig.novitaai = true;
            }
            
            console.log(`Session ${sessionId}: Calling AI.Chat with ${messagesForAI.length} messages`);
            
            const result = await this.AI.Chat(messagesForAI, chatConfig);

            // After streaming completes, store the response in session
            const finalResponse = fullResponse || (result?.full_text || '');
            
            if (finalResponse) {
              // Add to session messages
              session.messages.push({ role: 'assistant', content: finalResponse });
              session.lastActivity = Date.now();
            }
            
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (error) {
            console.error('Error processing message:', error);
            res.writeHead(500);
            res.end(JSON.stringify({error: 'Internal server error'}));
          }
        });
      } else if (req.method === 'POST' && req.url === '/reset') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            // Get session ID from header
            const sessionId = req.headers['x-session-id'];
            if (sessionId && this.sessions.has(sessionId)) {
              this.sessions.delete(sessionId);
              console.log(`Session ${sessionId} reset`);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'reset' }));
          } catch (error) {
            console.error('Error resetting session:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    EasyAI_WebGPT.instance = this;
  }

  /**
   * Get or create a session for the given session ID
   */
  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      console.log(`Creating new session: ${sessionId}`);
      this.sessions.set(sessionId, {
        id: sessionId,
        messages: [],  // Array of {role, content}
        lastActivity: Date.now(),
        createdAt: Date.now()
      });
    }
    
    const session = this.sessions.get(sessionId);
    session.lastActivity = Date.now();
    return session;
  }

  getPrimaryIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
  }

  static async PM2(config) {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const uniqueFileName = `pm2_webgpt_${timestamp}_${randomSuffix}.mjs`;
    const serverScriptPath = path.join('/tmp', uniqueFileName);

    const currentModulePath = path.dirname(fileURLToPath(import.meta.url));
    const easyAIServerPath = pathToFileURL(path.join(currentModulePath, '../EasyAI.js')).href;

    const fileContent = `import EasyAI from '${easyAIServerPath}';
const config = ${JSON.stringify(config)};
const server = new EasyAI.WebGPT(config);
server.start()`
    writeFileSync(serverScriptPath, fileContent);

    try {
      await execAsync(`pm2 start ${serverScriptPath}`);
      return uniqueFileName.slice(0,uniqueFileName.length-4);
    } catch (error) {
      console.error("PM2 error:", error.message);
      return false;
    }
  }

  async start() {
    if(this.handle_port){
        this.port = await FreePort(this.port);
    }
    this.server.listen(this.port, () => {
        const primaryIP = this.getPrimaryIP();
        console.log(`EasyAI WebGPT server is running on http://${primaryIP}:${this.port}`);
        console.log(`Sessions: Each browser tab gets its own independent chat session`);
        if (this.easyai_token) {
          console.log(`🔑 Using token: ${this.easyai_token.substring(0, 8)}...`);
        }
    });
  }
}

export default EasyAI_WebGPT;