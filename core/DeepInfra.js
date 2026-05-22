import https from 'https';

const brasilDateTime = () => new Date().toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'});

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

class DeepInfra {
    constructor(apiToken, config = {}) {
        this.apiToken = apiToken;
        this.config = config;
        this.model = config.model || 'Qwen/Qwen3-235B-A22B-Instruct-2507';
        this.baseUrl = config.baseUrl || 'api.deepinfra.com';
        this.Log = config.log || false;
    }

    static Models = [
        'deepseek-ai/DeepSeek-V4-Flash',
        'deepseek-ai/DeepSeek-V3.2',
        'meta-llama/Meta-Llama-3.1-8B-Instruct',
        'deepseek-ai/DeepSeek-V4-Pro',
        'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'zai-org/GLM-4.7-Flash'
    ]

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
            let fullResponse = '';
            let buffer = '';
            let usageData = null; // for streaming mode

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
                            if (this.Log && parsed.usage) {
                                console.log(`${ColorText.green(`[${brasilDateTime()}] ${config.model}(DeepInfra)`)} |${ColorText.red(` Cost : $${parsed.usage.estimated_cost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(parsed.usage.prompt_tokens)} | Output Tokens : ${ColorText.yellow(parsed.usage.completion_tokens)}`);
                            }
                            resolve({
                                full_text: content,
                                metadata: {
                                    usage: parsed.usage,
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
                    // Log cost if usage was received and logging is enabled
                    if (this.Log && usageData) {
                        console.log(`${ColorText.green(`[${brasilDateTime()}] ${config.model}(DeepInfra)`)} |${ColorText.red(` Cost : $${usageData.estimated_cost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(usageData.prompt_tokens)} | Output Tokens : ${ColorText.yellow(usageData.completion_tokens)}`);
                    }
                    resolve({
                        full_text: fullResponse,
                        metadata: {
                            streamed: true,
                            usage: usageData
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

export default DeepInfra;