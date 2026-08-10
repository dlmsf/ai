import https from 'https';

const brasilDateTime = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

class ColorText {
    static red(text) {
        return `\x1b[31m${text}\x1b[0m`; // Red text
    }

    static green(text) {
        return `\x1b[38;5;82m${text}\x1b[0m`; // Green text
    }

    static yellow(text) {
        return `\x1b[33m${text}\x1b[0m`; // Yellow text
    }

    static blue(text) {
        return `\x1b[34m${text}\x1b[0m`; // Blue text
    }

    static magenta(text) {
        return `\x1b[35m${text}\x1b[0m`; // Magenta text
    }

    static cyan(text) {
        return `\x1b[36m${text}\x1b[0m`; // Cyan text
    }

    static white(text) {
        return `\x1b[37m${text}\x1b[0m`; // White text
    }

    static orange(text) {
        return `\x1b[38;5;208m${text}\x1b[0m`; // Orange text
    }

    // Additional colors
    static black(text) {
        return `\x1b[30m${text}\x1b[0m`; // Black text
    }

    static brightRed(text) {
        return `\x1b[91m${text}\x1b[0m`; // Bright red text
    }

    static brightGreen(text) {
        return `\x1b[92m${text}\x1b[0m`; // Bright green text
    }

    static brightYellow(text) {
        return `\x1b[93m${text}\x1b[0m`; // Bright yellow text
    }

    static brightBlue(text) {
        return `\x1b[94m${text}\x1b[0m`; // Bright blue text
    }

    static brightMagenta(text) {
        return `\x1b[95m${text}\x1b[0m`; // Bright magenta text
    }

    static brightCyan(text) {
        return `\x1b[96m${text}\x1b[0m`; // Bright cyan text
    }

    static brightWhite(text) {
        return `\x1b[97m${text}\x1b[0m`; // Bright white text
    }

    static gray(text) {
        return `\x1b[90m${text}\x1b[0m`; // Gray text
    }

    static lightGray(text) {
        return `\x1b[37m${text}\x1b[0m`; // Light gray text (same as white)
    }

    static darkGray(text) {
        return `\x1b[90m${text}\x1b[0m`; // Dark gray text (same as gray)
    }

    static custom(text, colorCode) {
        return `\x1b[38;5;${colorCode}m${text}\x1b[0m`; // Custom color text
    }
}

/**
 * DeepSeek API client for interacting with DeepSeek's language models.
 * 
 * @class DeepSeek
 * @description A comprehensive client for the DeepSeek API that supports both streaming
 * and non-streaming chat completions, text generation, and various configuration options.
 * Maintains full compatibility with the DeepInfra interface structure while adding
 * DeepSeek-specific features like thinking mode, reasoning effort control, and tool calling.
 * 
 * @example
 * // Basic usage
 * const deepseek = new DeepSeek('your-api-token');
 * 
 * // Chat completion
 * const response = await deepseek.Chat([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * 
 * // Streaming with callback
 * await deepseek.Chat([
 *   { role: 'user', content: 'Tell me a story' }
 * ], {
 *   tokenCallback: ({ full_text, stream }) => {
 *     process.stdout.write(stream.content);
 *   }
 * });
 * 
 * // Using thinking mode
 * await deepseek.Chat([
 *   { role: 'user', content: 'Solve this complex problem' }
 * ], {
 *   thinking: { type: 'enabled' },
 *   reasoning_effort: 'high'
 * });
 */
class DeepSeek {
    /**
     * Pricing constants for DeepSeek models (per 1M tokens).
     * @private
     * @static
     */
    static Pricing = {
        'deepseek-v4-flash': {
            input_cache_hit: 0.0028,
            input_cache_miss: 0.14,
            output: 0.28
        },
        'deepseek-v4-pro': {
            input_cache_hit: 0.0145,
            input_cache_miss: 1.74,
            output: 3.48
        }
    };

    /**
     * Creates a new DeepSeek API client instance.
     * 
     * @constructor
     * @param {string} apiToken - The API token for authentication with DeepSeek API.
     * @param {Object} [config={}] - Configuration options for the client.
     * @param {string} [config.model='deepseek-v4-pro'] - The default model to use for completions.
     * @param {string} [config.baseUrl='api.deepseek.com'] - The base URL for the DeepSeek API.
     * @param {boolean} [config.log=false] - Whether to log cost and token usage information.
     * 
     * @example
     * const deepseek = new DeepSeek('sk-...', {
     *   model: 'deepseek-v4-flash',
     *   log: true
     * });
     */
    constructor(apiToken, config = {}) {
        this.apiToken = apiToken;
        this.config = config;
        this.model = config.model || 'deepseek-v4-pro';
        this.baseUrl = config.baseUrl || 'api.deepseek.com';
        this.Log = config.log || false;
    }

    /**
     * Available models for the DeepSeek API.
     * 
     * @static
     * @type {string[]}
     * @description List of supported model identifiers that can be used with the API.
     * 
     * @example
     * // Check available models
     * console.log(DeepSeek.Models);
     * // ['deepseek-v4-flash', 'deepseek-v4-pro']
     */
    static Models = [
        'deepseek-v4-flash',
        'deepseek-v4-pro'
    ]

    /**
     * Calculates the estimated cost based on token usage and model pricing.
     * 
     * @private
     * @param {string} model - The model identifier.
     * @param {Object} usage - The usage statistics from the API response.
     * @param {number} usage.prompt_tokens - Number of input tokens.
     * @param {number} usage.completion_tokens - Number of output tokens.
     * @param {number} [usage.prompt_cache_hit_tokens] - Number of cache hit tokens (optional, defaults to 0).
     * @param {number} [usage.prompt_cache_miss_tokens] - Number of cache miss tokens (optional, defaults to prompt_tokens if not provided).
     * @returns {number} The estimated cost in USD.
     */
    _calculateCost(model, usage) {
        const pricing = DeepSeek.Pricing[model];
        if (!pricing) return 0;

        const cacheHitTokens = usage.prompt_cache_hit_tokens || 0;
        const cacheMissTokens = usage.prompt_cache_miss_tokens !== undefined 
            ? usage.prompt_cache_miss_tokens 
            : (usage.prompt_tokens - cacheHitTokens);
        const outputTokens = usage.completion_tokens || 0;

        const cacheHitCost = (cacheHitTokens / 1000000) * pricing.input_cache_hit;
        const cacheMissCost = (cacheMissTokens / 1000000) * pricing.input_cache_miss;
        const outputCost = (outputTokens / 1000000) * pricing.output;

        return cacheHitCost + cacheMissCost + outputCost;
    }

    /**
     * Handles fallback streaming when the API fails to respond.
     * Provides a graceful degradation by simulating a streaming response
     * with an apology message.
     * 
     * @private
     * @param {Object} config - The configuration object for the request.
     * @param {Function} [config.tokenCallback] - Callback function for streaming tokens.
     * @param {boolean} [config.stream] - Whether the request is in streaming mode.
     * @returns {Promise<Object>} A promise that resolves with the fallback response.
     * @property {string} full_text - The complete fallback text.
     * @property {Object} metadata - Metadata about the fallback response.
     */
    _handleFallbackStream(config) {
        const tokens = ["Sorry", ", ", "I'm ", "unable ", "to ", "respond ", "at ", "the ", "moment."];
        const fullText = "Sorry, I'm unable to respond at the moment.";
        
        return new Promise((resolve) => {
            if (config.tokenCallback && config.stream !== false) {
                let i = 0;
                const streamNext = () => {
                    if (i < tokens.length) {
                        config.tokenCallback({ 
                            full_text: fullText.substring(0, fullText.indexOf(tokens[i]) + tokens[i].length),
                            stream: { content: tokens[i] } 
                        });
                        i++;
                        setTimeout(streamNext, 45);
                    } else {
                        resolve({ 
                            full_text: fullText, 
                            metadata: { streamed: true, fallback: true } 
                        });
                    }
                };
                streamNext();
            } else {
                resolve({ 
                    full_text: fullText, 
                    metadata: { fallback: true } 
                });
            }
        });
    }

    /**
     * Builds the messages array for the DeepSeek API endpoint.
     * 
     * @private
     * @param {Object[]} messages - Array of message objects with role and content.
     * @param {string} [systemPrompt] - Optional system prompt to prepend.
     * @returns {Object[]} Formatted messages array ready for the API request.
     */
    _buildMessages(messages, systemPrompt) {
        const result = [];
        if (systemPrompt) {
            result.push({ role: 'system', content: systemPrompt });
        }
        // messages already have role and content
        result.push(...messages);
        return result;
    }

    /**
     * Generates a text completion based on a prompt.
     * This is a convenience method that wraps the Chat method for simple text generation.
     * 
     * @param {string} [prompt='Once upon a time'] - The prompt to generate text from.
     * @param {Object} [config={}] - Configuration options for the generation.
     * @param {string} [config.model] - The model to use (overrides default).
     * @param {Function} [config.tokenCallback] - Callback for streaming tokens.
     * @param {string} [config.system_prompt] - System prompt for the generation.
     * @param {number} [config.max_tokens] - Maximum number of tokens to generate.
     * @param {number} [config.temperature] - Sampling temperature (0-2).
     * @param {number} [config.top_p] - Nucleus sampling parameter (0-1).
     * @param {Object} [config.thinking] - Thinking mode configuration.
     * @param {string} [config.reasoning_effort] - Reasoning effort level ('high' or 'max').
     * @param {Object} [config.tools] - Array of tool definitions for function calling.
     * @param {string|Object} [config.tool_choice] - Tool choice configuration.
     * @param {boolean} [config.logprobs] - Whether to return log probabilities.
     * @param {number} [config.top_logprobs] - Number of top log probabilities to return.
     * @param {string|string[]} [config.stop] - Stop sequences.
     * @param {Object} [config.response_format] - Response format configuration.
     * @param {boolean} [config.stream] - Whether to stream the response.
     * @param {Object} [config.stream_options] - Stream options configuration.
     * @param {string} [config.user_id] - Custom user identifier.
     * @returns {Promise<Object>} The generated completion response.
     * @property {string} full_text - The generated text.
     * @property {Object} metadata - Response metadata including usage statistics.
     * 
     * @example
     * const result = await deepseek.Generate('Once upon a time', {
     *   max_tokens: 500,
     *   temperature: 0.7
     * });
     * console.log(result.full_text);
     */
    async Generate(prompt = 'Once upon a time', config = {}) {
        const messages = [{ role: 'user', content: prompt }];
        return this.Chat(messages, {
            ...config,
            system_prompt: config.system_prompt || 'You are tasked with continuing the text based on the prompt provided. The AI operates purely on text generation, receiving and expanding upon the given prompt.'
        });
    }

    /**
     * Creates a chat completion using the DeepSeek API.
     * Supports both streaming and non-streaming modes with various configuration options.
     * 
     * @param {Object[]} [messages=[{ role: 'user', content: 'Who won the world series in 2020?' }]] - Array of conversation messages.
     * @param {Object} [config={}] - Configuration options for the chat completion.
     * @param {string} [config.model] - The model to use (overrides the instance default).
     * @param {string} [config.system_prompt] - System prompt to prepend to the conversation.
     * @param {Function} [config.tokenCallback] - Callback function for streaming mode. Receives an object with `full_text` and `stream` properties.
     * @param {number} [config.max_tokens] - Maximum number of tokens to generate in the completion.
     * @param {number} [config.temperature] - What sampling temperature to use, between 0 and 2. Higher values make output more random.
     * @param {number} [config.top_p] - Nucleus sampling parameter. Only tokens with top_p probability mass are considered.
     * @param {Object} [config.thinking] - Controls thinking mode. Use `{ type: 'enabled' }` to enable or `{ type: 'disabled' }` to disable.
     * @param {string} [config.reasoning_effort] - Controls reasoning effort. Options: 'high' or 'max'.
     * @param {Object} [config.response_format] - Specifies the output format. Use `{ type: 'json_object' }` for JSON output.
     * @param {string|string[]} [config.stop] - Up to 16 sequences where the API will stop generating further tokens.
     * @param {boolean} [config.stream] - Whether to stream the response (automatically set if tokenCallback is provided).
     * @param {Object} [config.stream_options] - Additional options for streaming.
     * @param {Object[]} [config.tools] - List of tools (functions) the model may call.
     * @param {string|Object} [config.tool_choice] - Controls which tool is called by the model ('none', 'auto', 'required', or specific tool).
     * @param {boolean} [config.logprobs] - Whether to return log probabilities of output tokens.
     * @param {number} [config.top_logprobs] - Number of most likely tokens to return (0-20, requires logprobs=true).
     * @param {string} [config.user_id] - Custom user identifier for rate limiting and KV cache isolation.
     * @returns {Promise<Object>} A promise that resolves with the chat completion response.
     * @property {string} full_text - The complete response text.
     * @property {Object} metadata - Response metadata including usage, id, model, and timestamps.
     * @property {Object} [metadata.usage] - Token usage statistics.
     * @property {number} [metadata.usage.completion_tokens] - Number of tokens in the completion.
     * @property {number} [metadata.usage.prompt_tokens] - Number of tokens in the prompt.
     * @property {number} [metadata.usage.total_tokens] - Total tokens used.
     * @property {Object} [metadata.usage.completion_tokens_details] - Detailed breakdown of completion tokens.
     * @property {number} [metadata.estimated_cost] - Estimated cost in USD based on token usage and model pricing.
     * 
     * @example
     * // Simple chat
     * const response = await deepseek.Chat([
     *   { role: 'user', content: 'What is the capital of France?' }
     * ]);
     * console.log(response.full_text);
     * 
     * @example
     * // Streaming chat
     * let fullResponse = '';
     * await deepseek.Chat([
     *   { role: 'user', content: 'Write a poem' }
     * ], {
     *   tokenCallback: ({ full_text, stream }) => {
     *     process.stdout.write(stream.content);
     *     fullResponse = full_text;
     *   }
     * });
     * 
     * @example
     * // With thinking mode enabled
     * const response = await deepseek.Chat([
     *   { role: 'user', content: 'Solve this math problem: 2+2*4' }
     * ], {
     *   thinking: { type: 'enabled' },
     *   reasoning_effort: 'high',
     *   max_tokens: 1000
     * });
     * 
     * @example
     * // Using tools/function calling
     * const response = await deepseek.Chat([
     *   { role: 'user', content: 'What\'s the weather in Tokyo?' }
     * ], {
     *   tools: [{
     *     type: 'function',
     *     function: {
     *       name: 'get_weather',
     *       description: 'Get the weather for a location',
     *       parameters: {
     *         type: 'object',
     *         properties: {
     *           location: { type: 'string' }
     *         }
     *       }
     *     }
     *   }],
     *   tool_choice: 'auto'
     * });
     */
    async Chat(messages = [{ role: 'user', content: 'Who won the world series in 2020?' }], config = {}) {
        config.model = config.model || this.model;
        
        // Default system rule: Respond in the same language as the user's query
        const defaultSystemRule = "You must always respond in the same language that the user is using in their message. Detect the user's language and respond accordingly.";
        
        const requestBody = {
            model: config.model,
            messages: this._buildMessages(messages, config.system_prompt || defaultSystemRule),
            stream: !!config.tokenCallback,
            // Map parameters to DeepSeek-compatible names
            ...(config.max_tokens !== undefined && { max_tokens: config.max_tokens }),
            ...(config.temperature !== undefined && { temperature: config.temperature }),
            ...(config.top_p !== undefined && { top_p: config.top_p }),
            ...(config.thinking !== undefined && { thinking: config.thinking }),
            ...(config.reasoning_effort !== undefined && { reasoning_effort: config.reasoning_effort }),
            ...(config.stop && { stop: config.stop }),
            ...(config.response_format && { response_format: config.response_format }),
            ...(config.tools && { tools: config.tools }),
            ...(config.tool_choice !== undefined && { tool_choice: config.tool_choice }),
            ...(config.logprobs !== undefined && { logprobs: config.logprobs }),
            ...(config.top_logprobs !== undefined && { top_logprobs: config.top_logprobs }),
            ...(config.user_id && { user_id: config.user_id }),
        };

        // Request usage in streaming mode to log cost at the end
        if (requestBody.stream) {
            requestBody.stream_options = config.stream_options || { include_usage: true };
        }

        const options = {
            hostname: this.baseUrl,
            port: 443,
            path: '/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.apiToken}`
            }
        };

        return new Promise((resolve) => {
            let fullResponse = '';
            let buffer = '';
            let usageData = null; // for streaming mode
            let streamId = null;
            let streamCreated = null;
            let streamModel = null;

            const req = https.request(options, res => {
                // Handle authentication errors (401, 403, etc.)
                if (res.statusCode === 401 || res.statusCode === 403) {
                    this._handleFallbackStream(config).then(resolve);
                    return;
                }

                // --- Non-streaming mode ---
                if (!config.tokenCallback) {
                    let rawData = '';
                    res.on('data', d => rawData += d.toString());
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(rawData);
                            if (parsed.error) {
                                this._handleFallbackStream(config).then(resolve);
                                return;
                            }
                            const content = parsed.choices?.[0]?.message?.content || '';
                            const usage = parsed.usage;
                            
                            // Calculate estimated cost
                            let estimatedCost = null;
                            if (usage) {
                                estimatedCost = this._calculateCost(config.model, usage);
                                usage.estimated_cost = estimatedCost;
                            }
                            
                            if (this.Log && usage) {
                                console.log(`${ColorText.cyan(`[${brasilDateTime()}] ${config.model}(DeepSeek)`)} |${ColorText.red(` Cost : $${estimatedCost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(usage.prompt_tokens)} | Output Tokens : ${ColorText.yellow(usage.completion_tokens)} | Cache Hit Tokens : ${ColorText.yellow(usage.prompt_cache_hit_tokens || 0)} | Cache Miss Tokens : ${ColorText.yellow(usage.prompt_cache_miss_tokens || usage.prompt_tokens)}`);
                            }
                            
                            resolve({
                                full_text: content,
                                metadata: {
                                    usage: usage,
                                    id: parsed.id,
                                    created: parsed.created,
                                    model: parsed.model
                                }
                            });
                        } catch (err) {
                            this._handleFallbackStream(config).then(resolve);
                        }
                    });
                    return;
                }

                // --- Streaming mode ---
                res.on('data', d => {
                    buffer += d.toString();
                    let newlineIndex = buffer.indexOf('\n');
                    while (newlineIndex !== -1) {
                        let line = buffer.substring(0, newlineIndex);
                        buffer = buffer.substring(newlineIndex + 1);
                        newlineIndex = buffer.indexOf('\n');

                        // Remove "data: " prefix if present
                        if (line.startsWith('data: ')) {
                            line = line.substring(6);
                        }

                        line = line.trim();
                        if (!line || line === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(line);

                            // Capture stream metadata from first chunk
                            if (!streamId && parsed.id) streamId = parsed.id;
                            if (!streamCreated && parsed.created) streamCreated = parsed.created;
                            if (!streamModel && parsed.model) streamModel = parsed.model;

                            // Capture usage if present (usually final chunk)
                            if (parsed.usage) {
                                usageData = parsed.usage;
                                continue; // no content in this chunk
                            }

                            const choice = parsed.choices?.[0];
                            if (!choice) continue;

                            const delta = choice.delta;
                            if (delta?.content) {
                                const tokenText = delta.content;
                                fullResponse += tokenText;
                                config.tokenCallback({
                                    full_text: fullResponse,
                                    stream: {
                                        content: tokenText,
                                        token: { text: tokenText }, // mimic old structure
                                        finish_reason: choice.finish_reason
                                    }
                                });
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete lines
                        }
                    }
                });

                res.on('end', () => {
                    // Calculate estimated cost and log if enabled
                    let estimatedCost = null;
                    if (usageData) {
                        estimatedCost = this._calculateCost(config.model, usageData);
                        usageData.estimated_cost = estimatedCost;
                    }
                    
                    if (this.Log && usageData) {
                        console.log(`${ColorText.cyan(`[${brasilDateTime()}] ${config.model}(DeepSeek)`)} |${ColorText.red(` Cost : $${estimatedCost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(usageData.prompt_tokens)} | Output Tokens : ${ColorText.yellow(usageData.completion_tokens)} | Cache Hit Tokens : ${ColorText.yellow(usageData.prompt_cache_hit_tokens || 0)} | Cache Miss Tokens : ${ColorText.yellow(usageData.prompt_cache_miss_tokens || usageData.prompt_tokens)}`);
                    }
                    
                    resolve({
                        full_text: fullResponse,
                        metadata: {
                            streamed: true,
                            usage: usageData,
                            id: streamId,
                            created: streamCreated,
                            model: streamModel
                        }
                    });
                });
            });

            req.on('error', error => {
                this._handleFallbackStream(config).then(resolve);
            });

            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }
}

export default DeepSeek;