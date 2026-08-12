import https from 'https';
import { StringDecoder } from 'node:string_decoder';

const brasilDateTime = () => new Date().toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'});

class ColorText {
    static red(text) {
        return `\x1b[31m${text}\x1b[0m`;
    }

    static green(text) {
        return `\x1b[38;5;82m${text}\x1b[0m`;
    }

    static yellow(text) {
        return `\x1b[33m${text}\x1b[0m`;
    }

    static blue(text) {
        return `\x1b[34m${text}\x1b[0m`;
    }

    static magenta(text) {
        return `\x1b[35m${text}\x1b[0m`;
    }

    static cyan(text) {
        return `\x1b[36m${text}\x1b[0m`;
    }

    static white(text) {
        return `\x1b[37m${text}\x1b[0m`;
    }

    static orange(text) {
        return `\x1b[38;5;208m${text}\x1b[0m`;
    }

    static black(text) {
        return `\x1b[30m${text}\x1b[0m`;
    }

    static brightRed(text) {
        return `\x1b[91m${text}\x1b[0m`;
    }

    static brightGreen(text) {
        return `\x1b[92m${text}\x1b[0m`;
    }

    static brightYellow(text) {
        return `\x1b[93m${text}\x1b[0m`;
    }

    static brightBlue(text) {
        return `\x1b[94m${text}\x1b[0m`;
    }

    static brightMagenta(text) {
        return `\x1b[95m${text}\x1b[0m`;
    }

    static brightCyan(text) {
        return `\x1b[96m${text}\x1b[0m`;
    }

    static brightWhite(text) {
        return `\x1b[97m${text}\x1b[0m`;
    }

    static gray(text) {
        return `\x1b[90m${text}\x1b[0m`;
    }

    static lightGray(text) {
        return `\x1b[37m${text}\x1b[0m`;
    }

    static darkGray(text) {
        return `\x1b[90m${text}\x1b[0m`;
    }

    static custom(text, colorCode) {
        return `\x1b[38;5;${colorCode}m${text}\x1b[0m`;
    }
}

class DeepInfra {
    constructor(apiToken, config = {}) {
        this.apiToken = apiToken;
        this.config = config;
        this.model = config.model || 'meta-llama/Meta-Llama-3.1-8B-Instruct';
        this.baseUrl = config.baseUrl || 'api.deepinfra.com';
        this.Log = config.log || false;
    }

    static Models = [
        'deepseek-ai/DeepSeek-V4-Flash-0731',
        'mistralai/Mistral-Nemo-Instruct-2407',
        'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        'deepseek-ai/DeepSeek-V4-Flash',
        'deepseek-ai/DeepSeek-V3.2',
        'nvidia/Nemotron-3-Nano-30B-A3B',
        'meta-llama/Meta-Llama-3.1-8B-Instruct',
        'deepseek-ai/DeepSeek-V4-Pro',
        'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'zai-org/GLM-4.7',
        'zai-org/GLM-4.7-Flash',
        'openai/gpt-oss-20b',
        'openai/gpt-oss-120b'
    ];

    /**
     * Handles fallback streaming when API fails
     * @private
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
     * Builds the messages array for the OpenAI-compatible endpoint.
     * @private
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

    async Generate(prompt = 'Once upon a time', config = {}) {
        const messages = [{ role: 'user', content: prompt }];
        return this.Chat(messages, {
            ...config,
            system_prompt: config.system_prompt || 'You are tasked with continuing the text based on the prompt provided. The AI operates purely on text generation, receiving and expanding upon the given prompt.'
        });
    }

    async Chat(messages = [{ role: 'user', content: 'Who won the world series in 2020?' }], config = {}) {
        config.model = config.model || this.model;

        const requestBody = {
            model: config.model,
            messages: this._buildMessages(messages, config.system_prompt),
            stream: !!config.tokenCallback,
            // Map parameters to OpenAI-compatible names
            ...(config.max_new_tokens !== undefined && { max_tokens: config.max_new_tokens }),
            ...(config.temperature !== undefined && { temperature: config.temperature }),
            ...(config.top_p !== undefined && { top_p: config.top_p }),
            ...(config.top_k !== undefined && { top_k: config.top_k }),
            ...(config.min_p !== undefined && { min_p: config.min_p }),
            ...(config.repetition_penalty !== undefined && { repetition_penalty: config.repetition_penalty }),
            ...(config.stop && { stop: config.stop }),
            ...(config.num_responses !== undefined && { n: config.num_responses }),
            ...(config.response_format && { response_format: config.response_format }),
            ...(config.presence_penalty !== undefined && { presence_penalty: config.presence_penalty }),
            ...(config.frequency_penalty !== undefined && { frequency_penalty: config.frequency_penalty }),
            ...(config.user && { user: config.user }),
            ...(config.seed !== undefined && { seed: config.seed }),
        };

        // Request usage in streaming mode to log cost at the end
        if (requestBody.stream) {
            requestBody.stream_options = { include_usage: true };
        }

        const options = {
            hostname: this.baseUrl,
            port: 443,
            path: '/v1/openai/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiToken}`
            }
        };

        return new Promise((resolve) => {
            let settled = false;
            const settle = (value) => {
                if (!settled) {
                    settled = true;
                    resolve(value);
                }
            };

            const req = https.request(options, res => {
                // Handle authentication errors (401, 403, etc.)
                if (res.statusCode === 401 || res.statusCode === 403) {
                    res.resume();
                    this._handleFallbackStream(config).then(settle);
                    return;
                }

                // --- Non-streaming mode ---
                if (!config.tokenCallback) {
                    const decoder = new StringDecoder('utf8');
                    let rawData = '';

                    res.on('data', d => {
                        rawData += decoder.write(d);
                    });

                    res.on('end', () => {
                        rawData += decoder.end();

                        try {
                            const parsed = JSON.parse(rawData);
                            if (parsed.error) {
                                this._handleFallbackStream(config).then(settle);
                                return;
                            }

                            const content = parsed.choices?.[0]?.message?.content || '';

                            if (this.Log && parsed.usage) {
                                console.log(`${ColorText.green(`[${brasilDateTime()}] ${config.model}(DeepInfra)`)} |${ColorText.red(` Cost : $${parsed.usage.estimated_cost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(parsed.usage.prompt_tokens)} | Output Tokens : ${ColorText.yellow(parsed.usage.completion_tokens)}`);
                            }

                            settle({
                                full_text: content,
                                metadata: {
                                    usage: parsed.usage,
                                    id: parsed.id,
                                    created: parsed.created,
                                    model: parsed.model
                                }
                            });
                        } catch (err) {
                            this._handleFallbackStream(config).then(settle);
                        }
                    });

                    res.on('error', () => {
                        this._handleFallbackStream(config).then(settle);
                    });

                    return;
                }

                // --- Streaming mode ---
                const decoder = new StringDecoder('utf8');
                let buffer = '';
                let fullResponse = '';
                let usageData = null;
                let streamId = null;
                let streamCreated = null;
                let streamModel = null;

                const processLine = (line) => {
                    line = line.trim();

                    if (line.startsWith('data: ')) {
                        line = line.substring(6);
                    }

                    line = line.trim();
                    if (!line || line === '[DONE]') return;

                    try {
                        const parsed = JSON.parse(line);

                        // Capture stream metadata from first chunk
                        if (!streamId && parsed.id) streamId = parsed.id;
                        if (!streamCreated && parsed.created) streamCreated = parsed.created;
                        if (!streamModel && parsed.model) streamModel = parsed.model;

                        const choice = parsed.choices?.[0];

                        // Process content BEFORE checking usage. Some providers may send
                        // usage and the last content token in the same SSE event.
                        if (choice) {
                            const delta = choice.delta;
                            if (delta?.content) {
                                const tokenText = delta.content;
                                fullResponse += tokenText;
                                config.tokenCallback({
                                    stream: {
                                        content: tokenText,
                                        finish_reason: choice.finish_reason
                                    }
                                });
                            }
                        }

                        // Capture usage data for logging/cost
                        if (parsed.usage) {
                            usageData = parsed.usage;
                        }
                    } catch (e) {
                        // Ignore malformed/incomplete SSE data lines
                    }
                };

                const processBuffer = (flush = false) => {
                    let newlineIndex = buffer.indexOf('\n');

                    while (newlineIndex !== -1) {
                        const line = buffer.substring(0, newlineIndex);
                        buffer = buffer.substring(newlineIndex + 1);
                        newlineIndex = buffer.indexOf('\n');
                        processLine(line);
                    }

                    // NUCLEAR KLUDGE:
                    // The final SSE line sometimes arrives without a trailing newline.
                    // If we don't flush it here, the last token is lost/cut.
                    if (flush && buffer.trim()) {
                        processLine(buffer);
                        buffer = '';
                    }
                };

                res.on('data', d => {
                    buffer += decoder.write(d);
                    processBuffer(false);
                });

                res.on('end', () => {
                    buffer += decoder.end();
                    // Flush any remaining buffered data before resolving.
                    processBuffer(true);

                    if (this.Log && usageData) {
                        console.log(`${ColorText.green(`[${brasilDateTime()}] ${config.model}(DeepInfra)`)} |${ColorText.red(` Cost : $${usageData.estimated_cost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(usageData.prompt_tokens)} | Output Tokens : ${ColorText.yellow(usageData.completion_tokens)}`);
                    }

                    settle({
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

                res.on('error', () => {
                    this._handleFallbackStream(config).then(settle);
                });
            });

            req.on('error', error => {
                this._handleFallbackStream(config).then(settle);
            });

            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }
}

export default DeepInfra;