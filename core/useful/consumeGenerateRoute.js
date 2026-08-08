import http from 'http';
import https from 'https';

const DEFAULT_ERROR_TOKENS = ["Sorry", ", ", "I'm ", "unable ", "to ", "respond ", "at ", "the ", "moment."];
const DEFAULT_ERROR_TEXT = "Sorry, I'm unable to respond at the moment.";

function isIpAddress(serverUrl) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(serverUrl);
}

function isConnectionError(error) {
  return error.code === 'ECONNREFUSED' || 
         error.code === 'ETIMEDOUT' || 
         error.code === 'ENOTFOUND' ||
         error.code === 'ECONNRESET' ||
         error.code === 'EAI_AGAIN' ||
         error.code === 'EHOSTUNREACH' ||
         error.code === 'ENETUNREACH' ||
         error.message?.includes('connect') ||
         error.message?.includes('connection') ||
         error.message?.includes('timeout') ||
         error.message?.includes('network') ||
         error.message?.includes('ECONNREFUSED') ||
         error.message?.includes('ETIMEDOUT');
}

async function streamDefaultErrorMessage(onData) {
  return new Promise((resolve) => {
    let i = 0;
    function streamNext() {
      if (i < DEFAULT_ERROR_TOKENS.length) {
        onData({
          stream: {
            content: DEFAULT_ERROR_TOKENS[i]
          }
        });
        i++;
        setTimeout(streamNext, 45);
      } else {
        resolve();
      }
    }
    streamNext();
  });
}

function attemptRequest({
  serverUrl,
  port,
  prompt,
  token = '',
  config = {},
  onData = () => {}
}) {
  return new Promise((resolve, reject) => {
    let isIp = undefined;

    if(serverUrl != 'localhost'){
      isIp = isIpAddress(serverUrl);
    } else {
      isIp = true;
    }

    const protocol = isIp ? http : https;

    if (isIp && !port) {
      port = 80;
    }

    if (!isIp) {
      port = 443;
    }

    const requestData = {
      prompt,
      config: config
    };
    
    if (token) {
      requestData.token = token;
    }

    const postData = JSON.stringify(requestData);

    const options = {
      hostname: serverUrl,
      port,
      path: '/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 120000
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = protocol.request(options, (res) => {
      let hasResolved = false;
      let buffer = '';
      let finalResult = null;

      res.on('data', (chunk) => {
        const chunkData = chunk.toString();
        buffer += chunkData;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const parsedChunk = JSON.parse(line.trim());
            
            if (parsedChunk.stream && config.stream) {
              onData(parsedChunk);
            } else if (parsedChunk.full_text !== undefined || parsedChunk.error !== undefined) {
              finalResult = parsedChunk;
            } else if (parsedChunk.choices?.[0]?.message?.content) {
              finalResult = parsedChunk;
            } else if (parsedChunk.choices?.[0]?.delta?.content) {
              if (config.stream) {
                onData(parsedChunk);
              } else {
                finalResult = parsedChunk;
              }
            }
          } catch (error) {
            // If JSON parsing fails, add back to buffer
            buffer = line + '\n' + buffer;
          }
        }
      });

      res.on('end', () => {
        if (!hasResolved) {
          hasResolved = true;
          
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              if (parsed.stream && config.stream) {
                onData(parsed);
              }
              if (parsed.full_text !== undefined || parsed.choices?.[0]?.message?.content) {
                finalResult = parsed;
              }
            } catch (error) {
              // Ignore unparseable remaining data
            }
          }
          
          resolve(finalResult || { 
            error: 'No valid response received from server',
            full_text: '' 
          });
        }
      });

      res.on('error', (error) => {
        if (!hasResolved) {
          hasResolved = true;
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

function consumeGenerateRoute({
  serverUrl,
  port,
  prompt,
  token = '',
  config = {},
  onData = () => {}
}) {
  return new Promise(async (resolve) => {
    const maxRetryTime = 60000;
    const retryDelay = 500;
    const startTime = Date.now();
    
    let lastError = null;
    let activeRequest = null;
    
    const streamLog = [];
    
    const wrappedOnData = (data) => {
      onData(data);
      streamLog.push(data);
    };
    
    const cleanup = () => {
      activeRequest = null;
    };
    
    const isStreaming = config.stream === true && typeof onData === 'function';
    
    while (Date.now() - startTime < maxRetryTime) {
      try {
        activeRequest = attemptRequest({
          serverUrl,
          port,
          prompt,
          token,
          config,
          onData: wrappedOnData
        });
        
        const result = await activeRequest;
        cleanup();
        
        let finalResult = result;
        if (typeof result === 'string') {
          finalResult = { full_text: result };
        }
        
        if (isStreaming && typeof finalResult === 'object' && finalResult !== null) {
          finalResult.streamLog = streamLog;
        }
        
        resolve(finalResult);
        return;
        
      } catch (error) {
        cleanup();
        lastError = error;
        
        if (error.responseBody) {
          resolve(error.responseBody);
          return;
        }
        
        if (!isConnectionError(error)) {
          break;
        }
        
        if (Date.now() - startTime < maxRetryTime - retryDelay) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    if (isStreaming) {
      await streamDefaultErrorMessage(wrappedOnData);
      resolve({ 
        error: lastError?.message || "server offline",
        full_text: DEFAULT_ERROR_TEXT,
        streamLog: streamLog
      });
    } else {
      resolve({ 
        error: lastError?.message || "server offline" 
      });
    }
  });
}

export default consumeGenerateRoute;