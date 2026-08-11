import https from 'https';

const brasilDateTime = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

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

class NovitaAI {
    constructor(apiToken, config = {}) {
        this.apiToken = apiToken;
        this.config = config;
        this.model = config.model ||  'meta-llama/llama-3.1-8b-instruct';
        this.baseUrl = config.baseUrl || 'api.novita.ai';
        this.Log = config.log || false;
    }

    static Models = [
        'meta-llama/llama-3.1-8b-instruct',
        'deepseek/deepseek-v4-flash-0731',
        'meta-llama/llama-3.3-70b-instruct',
        'deepseek/deepseek-v4-pro',
        'deepseek/deepseek-v4-flash',
        'meta-llama/llama-3.2-1b-instruct',
        'meta-llama/llama-3.2-3b-instruct',
        'zai-org/glm-4.7'
        
    ];

    /*
    let rest = [ 'moonshotai/kimi-k3',
        'tencent/hy3',
        'zai-org/glm-5.2',
        'moonshotai/kimi-k2.7-code',
    
        'mindai/macaron-v1-venti',
        'minimax/minimax-m3',
       
        'deepseek/deepseek-v3.2',
        'inclusionai/ling-3.0-flash',
        'stepfun/step-3.7-flash',
        'nvidia/nemotron-3-nano-30b-a3b',
        'baidu/cobuddy',
        'xiaomimimo/mimo-v2.5',
        'qwen/qwen3.7-max',
        'xiaomimimo/mimo-v2.5-pro',
        'qwen/qwen3.6-27b',
        'moonshotai/kimi-k2.6',
        'zai-org/glm-5.1',
        'minimax/minimax-m2.7-highspeed',
        'zai-org/glm-5v-turbo',
        'google/gemma-4-26b-a4b-it',
        'google/gemma-4-31b-it',
        'zai-org/glm-5-turbo',
        'xiaomimimo/mimo-v2-pro',
        'minimax/minimax-m2.7',
        'minimax/minimax-m2.5-highspeed',
        'qwen/qwen3.5-27b',
        'qwen/qwen3.5-122b-a10b',
        'qwen/qwen3.5-35b-a3b',
        'qwen/qwen3.5-397b-a17b',
        'minimax/minimax-m2.5',
        'zai-org/glm-5',
        'qwen/qwen3-coder-next',
        'deepseek/deepseek-ocr-2',
        'moonshotai/kimi-k2.5',
        'zai-org/glm-4.7-h',
        'zai-org/glm-4.7-flash',
        'minimax/minimax-m2.1',
        'zai-org/glm-4.7',
        'xiaomimimo/mimo-v2-flash',
        'zai-org/autoglm-phone-9b-multilingual',
        'moonshotai/kimi-k2-thinking',
        'minimax/minimax-m2',
        'paddlepaddle/paddleocr-vl',
        'deepseek/deepseek-v3.2-exp',
        'qwen/qwen3-vl-235b-a22b-thinking',
        'zai-org/glm-4.6v',
        'zai-org/glm-4.6',
        'qwen/qwen3.6-35b-a3b',
        'kwaipilot/kat-coder-pro',
        'qwen/qwen3-next-80b-a3b-instruct',
        'qwen/qwen3-next-80b-a3b-thinking',
        'deepseek/deepseek-ocr',
        'deepseek/deepseek-v3.1-terminus',
        'qwen/qwen3-vl-235b-a22b-instruct',
        'qwen/qwen3-max',
        'deepseek/deepseek-v3.1',
        'moonshotai/kimi-k2-0905',
        'qwen/qwen3-coder-480b-a35b-instruct',
        'qwen/qwen3-coder-30b-a3b-instruct',
        'openai/gpt-oss-120b',
        'moonshotai/kimi-k2-instruct',
        'deepseek/deepseek-v3-0324',
        'zai-org/glm-4.5',
        'qwen/qwen3-235b-a22b-thinking-2507',
        'deepseek/deepseek_v3',
       
        'google/gemma-3-12b-it',
        'zai-org/glm-4.5v',
        'openai/gpt-oss-20b',
        'qwen/qwen3-235b-a22b-instruct-2507',
        'deepseek/deepseek-r1-distill-qwen-14b',
        'meta-llama/llama-3.3-70b-instruct',
        'qwen/qwen-2.5-72b-instruct',
        'mistralai/mistral-nemo',
        'minimaxai/minimax-m1-80k',
        'deepseek/deepseek-r1-0528',
        'deepseek/deepseek-r1-distill-qwen-32b',
        'meta-llama/llama-3-8b-instruct',
        'microsoft/wizardlm-2-8x22b',
        'deepseek/deepseek-r1-0528-qwen3-8b',
        'deepseek/deepseek-r1-distill-llama-70b',
        'meta-llama/llama-3-70b-instruct',
        'qwen/qwen3-235b-a22b-fp8',
        'deepseek/deepseek-r1',
        'meta-llama/llama-4-maverick-17b-128e-instruct-fp8',
        'openchat/openchat-7b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'nousresearch/hermes-2-pro-llama-3-8b',
        'qwen/qwen2.5-vl-72b-instruct',
        'sao10k/l3-70b-euryale-v2.1',
        'nousresearch/nous-hermes-llama2-13b',
        'teknium/openhermes-2.5-mistral-7b',
        'baidu/ernie-4.5-21B-a3b-thinking',
        'sao10k/l3-8b-lunaris',
        'baichuan/baichuan-m2-32b',
        'baidu/ernie-4.5-vl-424b-a47b',
        'baidu/ernie-4.5-300b-a47b-paddle',
        'deepseek/deepseek-prover-v2-671b',
        'qwen/qwen3-32b-fp8',
        'qwen/qwen3-30b-a3b-fp8',
        'google/gemma-3-27b-it',
        'deepseek/deepseek-v3-turbo',
        'deepseek/deepseek-r1-turbo',
        'deepseek/deepseek-v3/community',
        'deepseek/deepseek-r1/community',
        'Sao10K/L3-8B-Stheno-v3.2',
        'gryphe/mythomax-l2-13b',
        'qwen/qwen3.8-max',
        'inclusionai/ring-2.6-1t',
        'inclusionai/ling-2.6-flash',
        'inclusionai/ling-2.6-1t',
        'elephant',
        'baidu/ernie-4.5-vl-28b-a3b-thinking',
        'qwen/qwen3-vl-8b-instruct',
        'zai-org/glm-4.5-air',
        'qwen/qwen3-vl-30b-a3b-instruct',
        'qwen/qwen3-vl-30b-a3b-thinking',
        'qwen/qwen3-omni-30b-a3b-thinking',
        'qwen/qwen3-omni-30b-a3b-instruct',
        'qwen/qwen-mt-plus',
        'baidu/ernie-4.5-vl-28b-a3b',
        'baidu/ernie-4.5-21B-a3b',
        'qwen/qwen3-8b-fp8',
        'qwen/qwen3-4b-fp8',
        'thudm/glm-4-32b-0414',
        'qwen/qwen2.5-7b-instruct',
        'qwen/qwen-2-vl-72b-instruct',
    
        'sao10k/l31-70b-euryale-v2.2',
        'qwen/qwen-2-7b-instruct']
    */

    static ModelCosts = {
        "moonshotai/kimi-k3": { inputCostPerMillion: 3.00, outputCostPerMillion: 15.00 },
        "tencent/hy3": { inputCostPerMillion: 0.14, outputCostPerMillion: 0.58 },
        "zai-org/glm-5.2": { inputCostPerMillion: 1.40, outputCostPerMillion: 4.40 },
        "moonshotai/kimi-k2.7-code": { inputCostPerMillion: 0.95, outputCostPerMillion: 4.00 },
        "deepseek/deepseek-v4-flash-0731": { inputCostPerMillion: 0.14, outputCostPerMillion: 0.28 },
        "mindai/macaron-v1-venti": { inputCostPerMillion: 1.50, outputCostPerMillion: 4.50 },
        "minimax/minimax-m3": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.20 },
        "deepseek/deepseek-v4-flash": { inputCostPerMillion: 0.14, outputCostPerMillion: 0.28 },
        "deepseek/deepseek-v4-pro": { inputCostPerMillion: 1.60, outputCostPerMillion: 3.20 },
        "deepseek/deepseek-v3.2": { inputCostPerMillion: 0.269, outputCostPerMillion: 0.40 },
        "inclusionai/ling-3.0-flash": { inputCostPerMillion: 0.06, outputCostPerMillion: 0.18 },
        "stepfun/step-3.7-flash": { inputCostPerMillion: 0.20, outputCostPerMillion: 1.15 },
        "nvidia/nemotron-3-nano-30b-a3b": { inputCostPerMillion: 0.05, outputCostPerMillion: 0.20 },
        "baidu/cobuddy": { inputCostPerMillion: 0.28, outputCostPerMillion: 1.13 },
        "xiaomimimo/mimo-v2.5": { inputCostPerMillion: 0.168, outputCostPerMillion: 0.336 },
        "qwen/qwen3.7-max": { inputCostPerMillion: 1.25, outputCostPerMillion: 3.75 },
        "xiaomimimo/mimo-v2.5-pro": { inputCostPerMillion: 0.522, outputCostPerMillion: 1.044 },
        "qwen/qwen3.6-27b": { inputCostPerMillion: 0.60, outputCostPerMillion: 3.60 },
        "moonshotai/kimi-k2.6": { inputCostPerMillion: 0.80, outputCostPerMillion: 3.40 },
        "zai-org/glm-5.1": { inputCostPerMillion: 1.38, outputCostPerMillion: 4.40 },
        "minimax/minimax-m2.7-highspeed": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.40 },
        "zai-org/glm-5v-turbo": { inputCostPerMillion: 1.20, outputCostPerMillion: 4.00 },
        "google/gemma-4-26b-a4b-it": { inputCostPerMillion: 0.13, outputCostPerMillion: 0.40 },
        "google/gemma-4-31b-it": { inputCostPerMillion: 0.14, outputCostPerMillion: 0.40 },
        "zai-org/glm-5-turbo": { inputCostPerMillion: 1.20, outputCostPerMillion: 4.00 },
        "xiaomimimo/mimo-v2-pro": { inputCostPerMillion: 2.00, outputCostPerMillion: 6.00 },
        "minimax/minimax-m2.7": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.20 },
        "minimax/minimax-m2.5-highspeed": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.40 },
        "qwen/qwen3.5-27b": { inputCostPerMillion: 0.30, outputCostPerMillion: 2.40 },
        "qwen/qwen3.5-122b-a10b": { inputCostPerMillion: 0.40, outputCostPerMillion: 3.20 },
        "qwen/qwen3.5-35b-a3b": { inputCostPerMillion: 0.25, outputCostPerMillion: 2.00 },
        "qwen/qwen3.5-397b-a17b": { inputCostPerMillion: 0.60, outputCostPerMillion: 3.60 },
        "minimax/minimax-m2.5": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.20 },
        "zai-org/glm-5": { inputCostPerMillion: 1.00, outputCostPerMillion: 3.20 },
        "qwen/qwen3-coder-next": { inputCostPerMillion: 0.20, outputCostPerMillion: 1.50 },
        "deepseek/deepseek-ocr-2": { inputCostPerMillion: 0.03, outputCostPerMillion: 0.03 },
        "moonshotai/kimi-k2.5": { inputCostPerMillion: 0.60, outputCostPerMillion: 3.00 },
        "zai-org/glm-4.7-h": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.20 },
        "zai-org/glm-4.7-flash": { inputCostPerMillion: 0.07, outputCostPerMillion: 0.40 },
        "minimax/minimax-m2.1": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.20 },
        "zai-org/glm-4.7": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.20 },
        "xiaomimimo/mimo-v2-flash": { inputCostPerMillion: 0.11, outputCostPerMillion: 0.33 },
        "zai-org/autoglm-phone-9b-multilingual": { inputCostPerMillion: 0.035, outputCostPerMillion: 0.138 },
        "moonshotai/kimi-k2-thinking": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.50 },
        "minimax/minimax-m2": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.20 },
        "paddlepaddle/paddleocr-vl": { inputCostPerMillion: 0.02, outputCostPerMillion: 0.02 },
        "deepseek/deepseek-v3.2-exp": { inputCostPerMillion: 0.27, outputCostPerMillion: 0.41 },
        "qwen/qwen3-vl-235b-a22b-thinking": { inputCostPerMillion: 0.98, outputCostPerMillion: 3.95 },
        "zai-org/glm-4.6v": { inputCostPerMillion: 0.30, outputCostPerMillion: 0.90 },
        "zai-org/glm-4.6": { inputCostPerMillion: 0.55, outputCostPerMillion: 2.20 },
        "qwen/qwen3.6-35b-a3b": { inputCostPerMillion: 0.248, outputCostPerMillion: 1.485 },
        "kwaipilot/kat-coder-pro": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.20 },
        "qwen/qwen3-next-80b-a3b-instruct": { inputCostPerMillion: 0.15, outputCostPerMillion: 1.50 },
        "qwen/qwen3-next-80b-a3b-thinking": { inputCostPerMillion: 0.15, outputCostPerMillion: 1.50 },
        "deepseek/deepseek-ocr": { inputCostPerMillion: 0.03, outputCostPerMillion: 0.03 },
        "deepseek/deepseek-v3.1-terminus": { inputCostPerMillion: 0.27, outputCostPerMillion: 1.00 },
        "qwen/qwen3-vl-235b-a22b-instruct": { inputCostPerMillion: 0.30, outputCostPerMillion: 1.50 },
        "qwen/qwen3-max": { inputCostPerMillion: 2.11, outputCostPerMillion: 8.45 },
        "deepseek/deepseek-v3.1": { inputCostPerMillion: 0.27, outputCostPerMillion: 1.00 },
        "moonshotai/kimi-k2-0905": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.50 },
        "qwen/qwen3-coder-480b-a35b-instruct": { inputCostPerMillion: 0.38, outputCostPerMillion: 1.55 },
        "qwen/qwen3-coder-30b-a3b-instruct": { inputCostPerMillion: 0.07, outputCostPerMillion: 0.27 },
        "openai/gpt-oss-120b": { inputCostPerMillion: 0.05, outputCostPerMillion: 0.25 },
        "moonshotai/kimi-k2-instruct": { inputCostPerMillion: 0.57, outputCostPerMillion: 2.30 },
        "deepseek/deepseek-v3-0324": { inputCostPerMillion: 0.27, outputCostPerMillion: 1.12 },
        "zai-org/glm-4.5": { inputCostPerMillion: 0.60, outputCostPerMillion: 2.20 },
        "qwen/qwen3-235b-a22b-thinking-2507": { inputCostPerMillion: 0.30, outputCostPerMillion: 3.00 },
        "deepseek/deepseek_v3": { inputCostPerMillion: 0.89, outputCostPerMillion: 0.89 },
        "meta-llama/llama-3.1-8b-instruct": { inputCostPerMillion: 0.02, outputCostPerMillion: 0.05 },
        "google/gemma-3-12b-it": { inputCostPerMillion: 0.05, outputCostPerMillion: 0.10 },
        "zai-org/glm-4.5v": { inputCostPerMillion: 0.60, outputCostPerMillion: 1.80 },
        "openai/gpt-oss-20b": { inputCostPerMillion: 0.04, outputCostPerMillion: 0.15 },
        "qwen/qwen3-235b-a22b-instruct-2507": { inputCostPerMillion: 0.09, outputCostPerMillion: 0.58 },
        "deepseek/deepseek-r1-distill-qwen-14b": { inputCostPerMillion: 0.15, outputCostPerMillion: 0.15 },
        "meta-llama/llama-3.3-70b-instruct": { inputCostPerMillion: 0.135, outputCostPerMillion: 0.40 },
        "qwen/qwen-2.5-72b-instruct": { inputCostPerMillion: 0.38, outputCostPerMillion: 0.40 },
        "mistralai/mistral-nemo": { inputCostPerMillion: 0.04, outputCostPerMillion: 0.17 },
        "minimaxai/minimax-m1-80k": { inputCostPerMillion: 0.55, outputCostPerMillion: 2.20 },
        "deepseek/deepseek-r1-0528": { inputCostPerMillion: 0.70, outputCostPerMillion: 2.50 },
        "deepseek/deepseek-r1-distill-qwen-32b": { inputCostPerMillion: 0.30, outputCostPerMillion: 0.30 },
        "meta-llama/llama-3-8b-instruct": { inputCostPerMillion: 0.04, outputCostPerMillion: 0.04 },
        "microsoft/wizardlm-2-8x22b": { inputCostPerMillion: 0.62, outputCostPerMillion: 0.62 },
        "deepseek/deepseek-r1-0528-qwen3-8b": { inputCostPerMillion: 0.06, outputCostPerMillion: 0.09 },
        "deepseek/deepseek-r1-distill-llama-70b": { inputCostPerMillion: 0.80, outputCostPerMillion: 0.80 },
        "meta-llama/llama-3-70b-instruct": { inputCostPerMillion: 0.51, outputCostPerMillion: 0.74 },
        "qwen/qwen3-235b-a22b-fp8": { inputCostPerMillion: 0.20, outputCostPerMillion: 0.80 },
        "deepseek/deepseek-r1": { inputCostPerMillion: 4.00, outputCostPerMillion: 4.00 },
        "meta-llama/llama-4-maverick-17b-128e-instruct-fp8": { inputCostPerMillion: 0.27, outputCostPerMillion: 0.85 },
        "openchat/openchat-7b": { inputCostPerMillion: 0.06, outputCostPerMillion: 0.06 },
        "meta-llama/llama-4-scout-17b-16e-instruct": { inputCostPerMillion: 0.18, outputCostPerMillion: 0.59 },
        "nousresearch/hermes-2-pro-llama-3-8b": { inputCostPerMillion: 0.14, outputCostPerMillion: 0.14 },
        "qwen/qwen2.5-vl-72b-instruct": { inputCostPerMillion: 0.80, outputCostPerMillion: 0.80 },
        "sao10k/l3-70b-euryale-v2.1": { inputCostPerMillion: 1.48, outputCostPerMillion: 1.48 },
        "nousresearch/nous-hermes-llama2-13b": { inputCostPerMillion: 0.17, outputCostPerMillion: 0.17 },
        "teknium/openhermes-2.5-mistral-7b": { inputCostPerMillion: 0.17, outputCostPerMillion: 0.17 },
        "baidu/ernie-4.5-21B-a3b-thinking": { inputCostPerMillion: 0.07, outputCostPerMillion: 0.28 },
        "sao10k/l3-8b-lunaris": { inputCostPerMillion: 0.05, outputCostPerMillion: 0.05 },
        "baichuan/baichuan-m2-32b": { inputCostPerMillion: 0.07, outputCostPerMillion: 0.07 },
        "baidu/ernie-4.5-vl-424b-a47b": { inputCostPerMillion: 0.42, outputCostPerMillion: 1.25 },
        "baidu/ernie-4.5-300b-a47b-paddle": { inputCostPerMillion: 0.28, outputCostPerMillion: 1.10 },
        "deepseek/deepseek-prover-v2-671b": { inputCostPerMillion: 0.70, outputCostPerMillion: 2.50 },
        "qwen/qwen3-32b-fp8": { inputCostPerMillion: 0.10, outputCostPerMillion: 0.45 },
        "qwen/qwen3-30b-a3b-fp8": { inputCostPerMillion: 0.09, outputCostPerMillion: 0.45 },
        "google/gemma-3-27b-it": { inputCostPerMillion: 0.119, outputCostPerMillion: 0.20 },
        "deepseek/deepseek-v3-turbo": { inputCostPerMillion: 0.40, outputCostPerMillion: 1.30 },
        "deepseek/deepseek-r1-turbo": { inputCostPerMillion: 0.70, outputCostPerMillion: 2.50 },
        "deepseek/deepseek-v3/community": { inputCostPerMillion: 0.89, outputCostPerMillion: 0.89 },
        "deepseek/deepseek-r1/community": { inputCostPerMillion: 4.00, outputCostPerMillion: 4.00 },
        "Sao10K/L3-8B-Stheno-v3.2": { inputCostPerMillion: 0.05, outputCostPerMillion: 0.05 },
        "gryphe/mythomax-l2-13b": { inputCostPerMillion: 0.09, outputCostPerMillion: 0.09 },
        "qwen/qwen3.8-max": { inputCostPerMillion: 2.00, outputCostPerMillion: 6.00 },
        "inclusionai/ring-2.6-1t": { inputCostPerMillion: 0.30, outputCostPerMillion: 2.50 },
        "inclusionai/ling-2.6-flash": { inputCostPerMillion: 0.10, outputCostPerMillion: 0.30 },
        "inclusionai/ling-2.6-1t": { inputCostPerMillion: 0.30, outputCostPerMillion: 2.50 },
        "elephant": { inputCostPerMillion: 0.10, outputCostPerMillion: 0.30 },
        "baidu/ernie-4.5-vl-28b-a3b-thinking": { inputCostPerMillion: 0.39, outputCostPerMillion: 0.39 },
        "qwen/qwen3-vl-8b-instruct": { inputCostPerMillion: 0.08, outputCostPerMillion: 0.50 },
        "zai-org/glm-4.5-air": { inputCostPerMillion: 0.13, outputCostPerMillion: 0.85 },
        "qwen/qwen3-vl-30b-a3b-instruct": { inputCostPerMillion: 0.20, outputCostPerMillion: 0.70 },
        "qwen/qwen3-vl-30b-a3b-thinking": { inputCostPerMillion: 0.20, outputCostPerMillion: 1.00 },
        "qwen/qwen3-omni-30b-a3b-thinking": { inputCostPerMillion: 0.25, outputCostPerMillion: 0.97 },
        "qwen/qwen3-omni-30b-a3b-instruct": { inputCostPerMillion: 0.25, outputCostPerMillion: 0.97 },
        "qwen/qwen-mt-plus": { inputCostPerMillion: 0.25, outputCostPerMillion: 0.75 },
        "baidu/ernie-4.5-vl-28b-a3b": { inputCostPerMillion: 0.14, outputCostPerMillion: 0.56 },
        "baidu/ernie-4.5-21B-a3b": { inputCostPerMillion: 0.07, outputCostPerMillion: 0.28 },
        "qwen/qwen3-8b-fp8": { inputCostPerMillion: 0.035, outputCostPerMillion: 0.138 },
        "qwen/qwen3-4b-fp8": { inputCostPerMillion: 0.03, outputCostPerMillion: 0.03 },
        "thudm/glm-4-32b-0414": { inputCostPerMillion: 0.55, outputCostPerMillion: 1.66 },
        "qwen/qwen2.5-7b-instruct": { inputCostPerMillion: 0.07, outputCostPerMillion: 0.07 },
        "qwen/qwen-2-vl-72b-instruct": { inputCostPerMillion: 0.45, outputCostPerMillion: 0.45 },
        "meta-llama/llama-3.2-1b-instruct": { inputCostPerMillion: 0.02, outputCostPerMillion: 0.02 },
        "meta-llama/llama-3.2-3b-instruct": { inputCostPerMillion: 0.03, outputCostPerMillion: 0.05 },
        "sao10k/l31-70b-euryale-v2.2": { inputCostPerMillion: 1.48, outputCostPerMillion: 1.48 },
        "qwen/qwen-2-7b-instruct": { inputCostPerMillion: 0.054, outputCostPerMillion: 0.054 }
    };

    /**
     * Calculate estimated cost based on model pricing
     * @private
     */
    _calculateCost(model, promptTokens, completionTokens) {
        const costs = NovitaAI.ModelCosts[model];
        if (!costs) return null;
        
        const inputCost = (promptTokens / 1000000) * costs.inputCostPerMillion;
        const outputCost = (completionTokens / 1000000) * costs.outputCostPerMillion;
        return inputCost + outputCost;
    }

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

        if (requestBody.stream) {
            requestBody.stream_options = { include_usage: true };
        }

        const options = {
            hostname: this.baseUrl,
            port: 443,
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiToken}`
            }
        };

        return new Promise((resolve) => {
            let fullResponse = '';
            let buffer = '';
            let usageData = null;
            let streamId = null;
            let streamCreated = null;
            let streamModel = null;

            const req = https.request(options, res => {
                if (res.statusCode === 401 || res.statusCode === 403) {
                    this._handleFallbackStream(config).then(resolve);
                    return;
                }

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
                            
                            let estimatedCost = null;
                            if (usage) {
                                estimatedCost = this._calculateCost(config.model, usage.prompt_tokens, usage.completion_tokens);
                                usage.estimated_cost = estimatedCost;
                            }
                            
                            if (this.Log && usage) {
                                console.log(`${ColorText.green(`[${brasilDateTime()}] ${config.model}(NovitaAI)`)} |${ColorText.red(` Cost : $${estimatedCost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(usage.prompt_tokens)} | Output Tokens : ${ColorText.yellow(usage.completion_tokens)}`);
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

                res.on('data', d => {
                    buffer += d.toString();
                    let newlineIndex = buffer.indexOf('\n');
                    while (newlineIndex !== -1) {
                        let line = buffer.substring(0, newlineIndex);
                        buffer = buffer.substring(newlineIndex + 1);
                        newlineIndex = buffer.indexOf('\n');

                        if (line.startsWith('data: ')) {
                            line = line.substring(6);
                        }

                        line = line.trim();
                        if (!line || line === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(line);

                            if (!streamId && parsed.id) streamId = parsed.id;
                            if (!streamCreated && parsed.created) streamCreated = parsed.created;
                            if (!streamModel && parsed.model) streamModel = parsed.model;

                            if (parsed.usage) {
                                usageData = parsed.usage;
                                continue;
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
                                        token: { text: tokenText },
                                        finish_reason: choice.finish_reason
                                    }
                                });
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                });

                res.on('end', () => {
                    let estimatedCost = null;
                    if (usageData) {
                        estimatedCost = this._calculateCost(config.model, usageData.prompt_tokens, usageData.completion_tokens);
                        usageData.estimated_cost = estimatedCost;
                    }
                    
                    if (this.Log && usageData) {
                        console.log(`${ColorText.green(`[${brasilDateTime()}] ${config.model}(NovitaAI)`)} |${ColorText.red(` Cost : $${estimatedCost?.toFixed(8) || 'N/A'}`)} | Input Tokens : ${ColorText.yellow(usageData.prompt_tokens)} | Output Tokens : ${ColorText.yellow(usageData.completion_tokens)}`);
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

export default NovitaAI;