import http from 'http';
import EasyAI from '../EasyAI.js';
import { networkInterfaces } from 'os';
import { URL } from 'url';
import { exec } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import PM2 from './useful/PM2.js'
import FreePort from './useful/FreePort.js';
import crypto from 'crypto';

function execAsync(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }

/**
 * @typedef {Object} EasyAI_ServerConfig
 * @property {number} [port=4000] - Port for the server to listen on
 * @property {string|string[]} [token] - Authentication token(s) for API requests
 * @property {boolean} [handle_port=true] - Whether to automatically find an available port
 * 
 * @property {Object} [server] - Additional server-specific configuration (for future use)
 * 
 * @property {boolean} [Llamacpp_InstancesRawLog=false] - Enable raw logging for LlamaCPP instances
 * @property {number} [GenerateTimeout=60000] - Timeout for generation in milliseconds
 * @property {number} [LlamaCPP_InstancesLimit=100] - Maximum number of LlamaCPP instances
 * @property {string} [ScaleMode='Process'] - Scaling mode for instances
 * @property {number} [SleepTolerance=300000] - Sleep tolerance in milliseconds
 * @property {string} [openai_token=''] - OpenAI API token
 * @property {string} [openai_model] - OpenAI model to use
 * @property {string} [deepinfra_token=''] - DeepInfra API token
 * @property {string} [deepinfra_model] - DeepInfra model to use
 * @property {string} [deepseek_token=''] - DeepSeek API token
 * @property {string} [deepseek_model] - DeepSeek model to use
 * @property {string} [server_url=''] - External server URL
 * @property {number} [server_port=4000] - External server port
 * @property {string} [server_token=''] - External server token
 * 
 * @property {Object} [llama] - LlamaCPP specific configuration
 * @property {boolean} [llama.jbuild=false] - Use JBuild for compilation
 * @property {boolean} [llama.vulkan=false] - Enable Vulkan support
 * @property {boolean} [llama.cmake=false] - Use CMake for compilation
 * @property {number} [llama.server_port] - Port for LlamaCPP server
 * @property {string} [llama.git_hash] - Specific git hash for LlamaCPP
 * @property {string} [llama.llama_model=''] - Path to Llama model
 * @property {boolean} [llama.cuda=false] - Enable CUDA support
 * @property {number} [llama.gpu_layers] - Number of layers to offload to GPU
 * @property {number} [llama.threads] - Number of threads to use
 * @property {string} [llama.lora] - LoRA adapter path
 * @property {string} [llama.lorabase] - Base model for LoRA
 * @property {number} [llama.context] - Context size
 * @property {number} [llama.slots] - Number of processing slots
 * @property {boolean} [llama.mlock] - Lock model in memory
 * @property {boolean} [llama.mmap] - Use memory mapping
 */

class EasyAI_Server {
    /**
     * Create a new EasyAI Server instance
     * @param {EasyAI_ServerConfig} config - Server and EasyAI configuration
     */
    constructor(config = {}) {
        // Extract server-specific properties
        const { 
            port = 4000, 
            token = '', 
            handle_port = true,
            server = {},
            ...easyAIConfig 
        } = config;

        this.port = port;
        this.handle_port = handle_port;
        
        // Use Maps for O(1) lookups and better concurrency
        this.tokenMap = new Map(); // token-value -> token-id for fast validation
        this.tokenStore = new Map(); // token-id -> token-object
        
        // Handle token initialization (supports string or array)
        if (Array.isArray(token)) {
            token.forEach(t => {
                if (t && typeof t === 'string' && t.trim() !== '') {
                    this.addToken(t, 'Initial Token');
                }
            });
        } else if (token && typeof token === 'string' && token.trim() !== '') {
            this.addToken(token, 'Initial Token');
        }
        
        this.serverConfig = server;
        
        // Create EasyAI instance with remaining config
        // If EasyAI_Config exists (backward compatibility), merge it
        if (config.EasyAI_Config) {
            Object.assign(easyAIConfig, config.EasyAI_Config);
        }
        
        easyAIConfig.deepinfra_log = true
        easyAIConfig.deepseek_log = true
        
        this.AI = new EasyAI(easyAIConfig);
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
    }

    /**
     * Validate token against configured tokens
     * @param {string} tokenToValidate - Token to validate
     * @returns {boolean} - True if token is valid
     */
    isValidToken(tokenToValidate) {
        // If no tokens are configured, accept any request (with or without token)
        if (this.tokenMap.size === 0) {
            return true;
        }
        
        // If token is required but none provided, reject
        if (!tokenToValidate) {
            return false;
        }
        
        // Check if token exists in map
        const tokenId = this.tokenMap.get(tokenToValidate);
        if (tokenId) {
            // Update last used timestamp asynchronously
            const token = this.tokenStore.get(tokenId);
            if (token) {
                token.lastUsed = new Date().toISOString();
            }
            return true;
        }
        
        return false;
    }

    /**
     * Extract token from request (Bearer header or body)
     * @param {http.IncomingMessage} req - HTTP request
     * @param {Object} body - Parsed request body
     * @returns {string|null} - Extracted token or null
     */
    extractToken(req, body) {
        // Check Authorization header first (Bearer token)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const bearerToken = authHeader.substring(7);
            if (bearerToken && bearerToken.trim() !== '') {
                return bearerToken;
            }
        }
        
        // Fallback to body token (backward compatibility)
        if (body && body.token && typeof body.token === 'string' && body.token.trim() !== '') {
            return body.token;
        }
        
        return null;
    }

    handleRequest(req, res) {
        const { pathname } = new URL(req.url, `http://${req.headers.host}`);

        if (req.method === 'POST' && (pathname === '/generate' || pathname === '/chat')) {
            let body = '';

            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', () => {
                try {
                    const requestData = JSON.parse(body);
                    
                    // Extract token from header or body
                    const providedToken = this.extractToken(req, requestData);

                    // Validate token
                    if (!this.isValidToken(providedToken)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid token.' }));
                        return;
                    }

                    // Remove token from requestData if present (for cleaner processing)
                    delete requestData.token;

                    if (pathname === '/generate') {
                        this.handleGenerate(req, res, requestData);
                    } else {
                        this.handleChat(req, res, requestData);
                    }
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Bad request.' }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found.' }));
        }
    }

    handleGenerate(req, res, requestData) {
        const config = requestData.config || { stream: false, retryLimit: 60000 };
        
        if (config.stream) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });

            config.tokenCallback = (token) => {
                res.write(JSON.stringify(token) + '\n');
            }

            this.AI.Generate(requestData.prompt, config).then(result => {
                if (result) {
                    res.write(JSON.stringify(result));
                }
                res.end();
            }).catch(error => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });
        } else {
            this.AI.Generate(requestData.prompt, config).then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            }).catch(error => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });
        }
    }

    handleChat(req, res, requestData) {
        const config = requestData.config || { stream: false, retryLimit: 60000 };
        
        if (config.stream) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });

            config.tokenCallback = (token) => {
                res.write(JSON.stringify(token) + '\n');
            }

            this.AI.Chat(requestData.messages, config).then(result => {
                if (result) {
                    res.write(JSON.stringify(result));
                }
                res.end();
            }).catch(error => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });
        } else {
            this.AI.Chat(requestData.messages, config).then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            }).catch(error => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });
        }
    }

    // Token management methods with Map storage
    addToken(token, name = '') {
        const tokenValue = token || this.generateToken();
        const id = this.generateId();
        
        const tokenObject = {
            id,
            name,
            token: tokenValue,
            createdAt: new Date().toISOString(),
            lastUsed: null
        };
        
        // Store in both Maps for O(1) access
        this.tokenMap.set(tokenValue, id);
        this.tokenStore.set(id, tokenObject);
        
        return { ...tokenObject }; // Return copy to prevent external modification
    }

    getTokens() {
        const tokens = [];
        for (const [id, token] of this.tokenStore) {
            tokens.push({
                id: token.id,
                name: token.name,
                createdAt: token.createdAt,
                lastUsed: token.lastUsed
            });
        }
        return tokens;
    }

    getToken(id) {
        const token = this.tokenStore.get(id);
        if (token) {
            return {
                id: token.id,
                name: token.name,
                token: token.token,
                createdAt: token.createdAt,
                lastUsed: token.lastUsed
            };
        }
        return null;
    }

    deleteToken(id) {
        const token = this.tokenStore.get(id);
        if (token) {
            // Remove from both Maps
            this.tokenMap.delete(token.token);
            this.tokenStore.delete(id);
            return true;
        }
        return false;
    }

    updateToken(id, updates) {
        const token = this.tokenStore.get(id);
        if (token) {
            if (updates.name) token.name = updates.name;
            
            if (updates.token && updates.token !== token.token) {
                // Update tokenMap with new value
                this.tokenMap.delete(token.token);
                this.tokenMap.set(updates.token, id);
                token.token = updates.token;
            }
            
            return {
                id: token.id,
                name: token.name,
                token: token.token,
                createdAt: token.createdAt,
                lastUsed: token.lastUsed
            };
        }
        return null;
    }

    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    generateId() {
        return crypto.randomBytes(16).toString('hex');
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
        async function findEasyAIServerPath() {
            let filePath = './EasyAI.js';
            if (!existsSync(path.resolve(process.cwd(), filePath))) {
                const currentModuleUrl = import.meta.url;
                const currentModulePath = fileURLToPath(currentModuleUrl);
                const currentModuleDir = path.dirname(currentModulePath);
                const parentDir = path.dirname(currentModuleDir);
                filePath = path.join(parentDir, 'EasyAI.js');
            }
            return pathToFileURL(filePath).href;
        }
    
        const timestamp = Date.now();
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const uniqueFileName = `pm2_easyai_server_${timestamp}_${randomSuffix}.mjs`;
        const serverScriptPath = path.join('/tmp', uniqueFileName);
        
        const easyAIServerPath = await findEasyAIServerPath();
    
        const fileContent = `import EasyAI from '${easyAIServerPath}';
    const config = ${JSON.stringify(config)};
    const server = new EasyAI.Server(config);
    server.start();`;
    
        writeFileSync(serverScriptPath, fileContent);
        
        try {
            await execAsync(`pm2 start ${serverScriptPath} --cwd ${process.cwd()}`);
            console.log("PM2 process successfully managed.");
            return uniqueFileName.slice(0,uniqueFileName.length-4);
        } catch (error) {
            console.error(`PM2 process management error: ${error.message}`);
            return false;
        }
    }
    

    async start() {
        if(this.handle_port){
            this.port = await FreePort(this.port);
        }
        this.server.listen(this.port, () => {
            const primaryIP = this.getPrimaryIP();
            console.log(`EasyAI server is running on http://${primaryIP}:${this.port}`);
            console.log(`Token store initialized with ${this.tokenMap.size} token(s)`);
        });
    }
}

export default EasyAI_Server;