import EasyAI_Server from "./core/EasyAI_Server.js";
import LlamaCPP from "./core/Llama/LlamaCPP.js"
import consumeGenerateRoute from "./core/useful/consumeGenerateRoute.js";
import ChatModule from "./core/ChatModule/ChatModule.js";
import isNonEmptyFunction from "./core/useful/isNonEmptyFunction.js";
import renameProperty from './core/useful/renameProperty.js'
import OpenAI from './core/OpenAI.js'
import EasyAI_WebGPT from "./core/EasyAI_WebGPT.js";
import ChatPrompt from "./core/MenuCLI/Sandbox/ChatPrompt.js";
import LogMaster from './core/LogMaster.js'
import FileTool from "./core/useful/FileTool.js";
import generateUniqueCode from "./core/util/generateUniqueCode.js";
import ConfigManager from "./core/ConfigManager.js";
import {exec} from 'child_process'
import DeepInfra from './core/DeepInfra.js'
import DeepSeek from './core/DeepSeek.js'
import NovitaAI from './core/NovitaAI.js'
import NewChatPrompt from "./core/util/NewChatPrompt.js";
import consumeChatRoute from "./core/useful/consumeChatRoute.js";

/**
 * Creates a streaming callback wrapper that accumulates the full text from individual stream tokens.
 * This solves the problem where some providers return a truncated full_text in the final streaming result.
 * 
 * @param {Function} originalCallback - The original token callback function
 * @returns {Object} - { wrappedCallback, getAccumulatedText }
 */
function createStreamAccumulator(originalCallback) {
    let accumulatedText = '';
    
    const wrappedCallback = (token) => {
        if (token && token.stream && typeof token.stream.content === 'string') {
            accumulatedText += token.stream.content;
        } else if (token && typeof token.content === 'string') {
            accumulatedText += token.content;
        } else if (token && token.choices && token.choices[0] && token.choices[0].delta && token.choices[0].delta.content) {
            accumulatedText += token.choices[0].delta.content;
        }
        
        if (typeof originalCallback === 'function') {
            originalCallback(token);
        }
    };
    
    return {
        wrappedCallback,
        getAccumulatedText: () => accumulatedText,
        hasText: () => accumulatedText.length > 0
    };
}

/**
 * Generates a default error response with optional streaming tokens
 */
function generateDefaultErrorResponse(config, tokenCallback) {
    const tokens = ["Sorry", ", ", "I'm ", "unable ", "to ", "respond ", "at ", "the ", "moment."];
    const fullText = "Sorry, I'm unable to respond at the moment.";
    
    if (config.stream === true && typeof tokenCallback === 'function') {
        return new Promise((resolve) => {
            let i = 0;
            (function next() {
                if (i < tokens.length) {
                    tokenCallback({stream: {content: tokens[i]}});
                    i++;
                    setTimeout(next, 45);
                } else {
                    resolve({ full_text: fullText });
                }
            })();
        });
    }
    
    return { full_text: fullText };
}

class EasyAI {
    /**
     * @param {Object} config
     * @param {boolean} [config.Llamacpp_InstancesRawLog=false]
     * @param {number} [config.GenerateTimeout=60000]
     * @param {number} [config.LlamaCPP_InstancesLimit=100]
     * @param {string} [config.ScaleMode='Process']
     * @param {number} [config.SleepTolerance=300000]
     * @param {string} [config.openai_token='']
     * @param {string} [config.openai_model]
     * @param {string} [config.deepinfra_token='']
     * @param {string} [config.deepinfra_model]
     * @param {string} [config.deepseek_token='']
     * @param {string} [config.deepseek_model]
     * @param {string} [config.novitaai_token='']
     * @param {string} [config.novitaai_model]
     * @param {string} [config.server_url='']
     * @param {number} [config.server_port=4000]
     * @param {string} [config.server_token='']
     * @param {Object} [config.llama]
     * @param {boolean} [config.llama.jbuild=false]
     * @param {boolean} [config.llama.vulkan=false]
     * @param {boolean} [config.llama.cmake=false]
     * @param {number} [config.llama.server_port]
     * @param {string} [config.llama.git_hash]
     * @param {string} [config.llama.llama_model='']
     * @param {boolean} [config.llama.cuda=false]
     * @param {number} [config.llama.gpu_layers]
     * @param {number} [config.llama.threads]
     * @param {string} [config.llama.lora]
     * @param {string} [config.llama.lorabase]
     * @param {number} [config.llama.context]
     * @param {number} [config.llama.slots]
     * @param {boolean} [config.llama.mlock]
     * @param {boolean} [config.llama.mmap]
     */
    constructor(config = {}) {
        const defaults = {
            Llamacpp_InstancesRawLog: false,
            GenerateTimeout: 60000,
            LlamaCPP_InstancesLimit: 100,
            ScaleMode: 'Process',
            SleepTolerance: 200000,
            openai_token: '',
            openai_model: undefined,
            deepinfra_token : '',
            deepinfra_model : undefined,
            deepseek_token : '',
            deepseek_model : undefined,
            novitaai_token : '',
            novitaai_model : undefined,
            server_url: '',
            server_port: 4000,
            server_token: '',
            llama: {
                jbuild: false,
                vulkan: false,
                cmake: false,
                server_port: undefined,
                git_hash: undefined,
                llama_model: '',
                cuda: false,
                gpu_layers: undefined,
                threads: undefined,
                lora: undefined,
                lorabase: undefined,
                context: undefined,
                slots: undefined,
                mlock: undefined,
                mmap: undefined
            }
        };

        this.Made = false
        this.Checker = {
            Runnage : setInterval(() => {
                if(!this.Made){
                    let quant = 0
                    this.LlamaCPP.Instances.forEach(e => {
                        if(e.ServerOn && quant < 1){
                            quant++
                            this.Made = true
                            this.Checker.Runnage = null
                            this.LlamaCPP.Instances = []
                            this.LlamaCPP.NewInstance()
                        }
                    })
                    
                }
            },500)
        }
        
        this.Config = {
            ...defaults,
            ...config,
            llama: {
                ...defaults.llama,
                ...(config.llama || {})
            }
        };
        
        if(ConfigManager.getKey('start-llamacpp-instanceslog')){this.Config.Llamacpp_InstancesRawLog = true}

        this.ChatModule = new ChatModule()
        this.OpenAI = (config.openai_token) ? new OpenAI(config.openai_token,{model : config.openai_model}) : null
        this.DeepInfra = (config.deepinfra_token) ? new DeepInfra(config.deepinfra_token,{model : config.deepinfra_model,log : config.deepinfra_log}) : null
        this.DeepSeek = (config.deepseek_token) ? new DeepSeek(config.deepseek_token,{model : config.deepseek_model,log : config.deepseek_log}) : null
        this.NovitaAI = (config.novitaai_token) ? new NovitaAI(config.novitaai_token,{model : config.novitaai_model,log : config.novitaai_log}) : null

        this.ServerURL = config.server_url || null
        this.ServerPORT = config.server_port || 4000
        this.ServerTOKEN = config.server_token || null

        this.LlamaCPP = {
            Instances: [],
            NewInstance: () => {
                let uniqueid = generateUniqueCode({length : 6,existingObjects : this.LlamaCPP.Instances,codeProperty : 'UniqueID'})

                this.LlamaCPP.Instances.push(new LlamaCPP({
                    uniqueid : uniqueid,
                    server_port: (this.Config.llama) ? this.Config.llama.server_port : undefined,
                    git_hash: (this.Config.llama) ? this.Config.llama.git_hash : undefined,
                    modelpath: (this.Config.llama) ? this.Config.llama.llama_model : undefined,
                    cuda: (this.Config.llama) ? this.Config.llama.cuda : undefined,
                    gpu_layers: (this.Config.llama) ? this.Config.llama.gpu_layers : undefined,
                    threads: (this.Config.llama) ? this.Config.llama.threads : undefined,
                    lora: (this.Config.llama) ? this.Config.llama.lora : undefined,
                    lorabase: (this.Config.llama) ? this.Config.llama.lorabase : undefined,
                    context: (this.Config.llama) ? this.Config.llama.context : undefined,
                    slots: (this.Config.llama) ? this.Config.llama.slots : undefined,
                    mlock: (this.Config.llama) ? this.Config.llama.mlock : undefined,
                    mmap: (this.Config.llama) ? this.Config.llama.mmap : undefined,
                    cmake: (this.Config.llama) ? this.Config.llama.cmake : undefined,
                    vulkan: (this.Config.llama) ? this.Config.llama.vulkan : undefined,
                    jbuild: (this.Config.llama) ? this.Config.llama.jbuild : undefined
                }))
        
                if (this.LlamaCPP.Instances.length === 1) {
                    this.LlamaCPP.startIntervals();
                    this.LlamaCPP.startQueueProcessor();
                }
            return uniqueid
            },
            RestartAll: () => {
                
            },
            Cleaner: null,
            Log: null,
            QueueProcessor: null,
            startIntervals: () => {
                if (!this.LlamaCPP.Cleaner && this.LlamaCPP.Instances.length > 0) {
                    this.LlamaCPP.Cleaner = setInterval(() => {
                        this.LlamaCPP.Instances.forEach((instance, index) => {
                            if (((Date.now() - instance.LastAction) > this.Config.SleepTolerance) && index != 0 && !this.LlamaCPP.Instances[index].InUse) {
                                exec(`kill -9 ${this.LlamaCPP.Instances[index].ProcessPID}`, (error) => {
                                    if (error) console.error(`Error killing process: ${error}`);
                                  })
                                this.LlamaCPP.Instances.splice(index, 1)
                                if (this.LlamaCPP.Instances.length === 0) {
                                    this.LlamaCPP.stopAll();
                                }
                            }
                        })
                    }, 10000)
                    
                    if(this.Config.Llamacpp_InstancesRawLog){
                        this.LlamaCPP.Log = setInterval(() => {
                            LogMaster.Log('LlamaCPP Instances', this.LlamaCPP.Instances,{statusMode : true})
                        }, 100)
                    }
                }
            },
            startQueueProcessor: () => {
                if (!this.LlamaCPP.QueueProcessor) {
                    const processQueue = () => {
                        if (!this.LlamaCPP || !this.LlamaCPP.GetInstance_Queue) {
                            this.LlamaCPP.QueueProcessor = setTimeout(processQueue, 100);
                            return;
                        }
        
                        this.LlamaCPP.GetInstance_Queue.forEach((request, index) => {
                            if (request.index === -1) {
                                let instanceIndex = this.LlamaCPP.Instances.findIndex(instance => instance.InUse == false);
                                let created_uniqueid
                                if(!request.noCreation && instanceIndex == -1){
                                    created_uniqueid = this.LlamaCPP.NewInstance();
                                    instanceIndex = this.LlamaCPP.Instances.findIndex(instance => instance.UniqueID == created_uniqueid);
                                    this.LlamaCPP.GetInstance_Queue[index].index = instanceIndex
                                    this.LlamaCPP.Instances[instanceIndex].InUse = true;
                                } else {
                                    this.LlamaCPP.GetInstance_Queue[index].index = instanceIndex
                                }

                                this.LlamaCPP.GetInstance_Queue[index].ready = true
                            }
                        });
        
                        this.LlamaCPP.QueueProcessor = setTimeout(processQueue, 10);
                    };
                    this.LlamaCPP.QueueProcessor = setTimeout(processQueue, 10);
                }
            },
            stopAll: () => {
                if (this.LlamaCPP.Cleaner) {
                    clearInterval(this.LlamaCPP.Cleaner)
                    this.LlamaCPP.Cleaner = null
                }
                if (this.LlamaCPP.Log) {
                    clearInterval(this.LlamaCPP.Log)
                    this.LlamaCPP.Log = null
                }
                if (this.LlamaCPP.QueueProcessor) {
                    clearTimeout(this.LlamaCPP.QueueProcessor)
                    this.LlamaCPP.QueueProcessor = null
                }
            },
            GetInstance_Queue: [],
            GetInstance: async (config = {noCreation : false}) => {
                let code = generateUniqueCode({ 
                    length: 10, 
                    existingObjects: this.LlamaCPP.GetInstance_Queue, 
                    codeProperty: 'id' 
                })
                this.LlamaCPP.GetInstance_Queue.push({
                    ready : false,
                    id: code,
                    noCreation : config.noCreation || false,
                    index: -1
                })
        
                const waitUntilReady = (code) => {
                    return new Promise((resolve) => {
                        const check = () => {
                            const instance = this.LlamaCPP.GetInstance_Queue.find(queueItem => queueItem.id == code);
                            if (instance && instance.ready == true) {
                                resolve(instance);
                            } else {
                                setTimeout(check, 10);
                            }
                        }
                        check();
                    });
                }
        
                await waitUntilReady(code)
                
                let queueIndex = this.LlamaCPP.GetInstance_Queue.findIndex(queueItem => queueItem.id == code)
                let instanceIndex = this.LlamaCPP.GetInstance_Queue[queueIndex].index
                this.LlamaCPP.GetInstance_Queue.splice(queueIndex, 1)
                return instanceIndex
            }
        }
        
        this.WaitServerOn = async (instanceIndex) => {
            if (!this.LlamaCPP.Instances[instanceIndex]) {
                return -1;
            }
            
            const timeout = this.Config.GenerateTimeout;
            const startTime = Date.now();
            
            while (!this.LlamaCPP.Instances[instanceIndex].ServerOn) {
            
                if (Date.now() - startTime > timeout) {
                    return -1;
                }
                
            
                const newInstanceIndex = await this.LlamaCPP.GetInstance({ noCreation: true });
                
                if (newInstanceIndex !== -1 && newInstanceIndex !== instanceIndex) {
               
                    this.LlamaCPP.Instances[newInstanceIndex].InUse = true;
                    this.LlamaCPP.Instances[instanceIndex].InUse = false;
                    return newInstanceIndex;
                }
                
              
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            
           
            return instanceIndex;
        }

        if(!this.ServerURL && !this.OpenAI && !this.DeepInfra && !this.DeepSeek && !this.NovitaAI){
            this.LlamaCPP.NewInstance()
        }
    }

    async Generate(prompt = 'Once upon a time', config = {openai : false,deepinfra : false,deepseek : false,novitaai : false,logerror : false, stream: true, retryLimit: 420000,tokenCallback : () => {}}) {

        const isStreaming = typeof config.tokenCallback === 'function' && isNonEmptyFunction(config.tokenCallback);
        config.stream = isStreaming;

        let streamAccumulator = null;
        let originalCallback = config.tokenCallback;
        
        if (isStreaming) {
            streamAccumulator = createStreamAccumulator(originalCallback);
            config.tokenCallback = streamAccumulator.wrappedCallback;
        }

        const fixTruncatedFullText = (result) => {
            if (result && typeof result === 'object' && streamAccumulator && streamAccumulator.hasText()) {
                const accumulatedText = streamAccumulator.getAccumulatedText();
                if (!result.full_text || accumulatedText.length > result.full_text.length) {
                    result.full_text = accumulatedText;
                }
            }
            return result;
        };

        if(this.ServerURL || this.OpenAI || this.DeepInfra || this.DeepSeek || this.NovitaAI){

            if(this.ServerURL){
                if((config.openai && this.OpenAI) || (config.deepinfra && this.DeepInfra) || (config.deepseek && this.DeepSeek) || (config.novitaai && this.NovitaAI)){
                    let result;
                    try {
                        if(config.openai && this.OpenAI) {
                            delete config.openai;
                            result = await this.OpenAI.Generate(prompt, config);
                        } else if(config.deepinfra && this.DeepInfra) {
                            delete config.deepinfra;
                            result = await this.DeepInfra.Generate(prompt, config);
                        } else if(config.deepseek && this.DeepSeek) {
                            delete config.deepseek;
                            result = await this.DeepSeek.Generate(prompt, config);
                        } else if(config.novitaai && this.NovitaAI) {
                            delete config.novitaai;
                            result = await this.NovitaAI.Generate(prompt, config);
                        }
                        return fixTruncatedFullText(result);
                    } catch(e) {
                        return await generateDefaultErrorResponse(config, originalCallback);
                    }
                } else {
                    let consume_result = await consumeGenerateRoute({
                        serverUrl : this.ServerURL,
                        port : this.ServerPORT,
                        prompt : prompt,
                        token : this.ServerTOKEN,
                        config : config,
                        onData : config.tokenCallback
                    });
                    
                    consume_result = fixTruncatedFullText(consume_result);
                    
                    if(consume_result.error && (consume_result.error == 'server offline' || consume_result.error == 'Invalid token.')){
                        return await generateDefaultErrorResponse(config, originalCallback);
                    }

                    return consume_result;
                }
                
            } else {
                let result;
                try {
                    if(this.OpenAI && !config.deepinfra && !config.deepseek && !config.novitaai) {
                        result = await this.OpenAI.Generate(prompt, config);
                    } else if(this.DeepInfra && !config.deepseek && !config.novitaai) {
                        result = await this.DeepInfra.Generate(prompt, config);
                    } else if(this.DeepSeek && !config.novitaai) {
                        result = await this.DeepSeek.Generate(prompt, config);
                    } else if(this.NovitaAI) {
                        result = await this.NovitaAI.Generate(prompt, config);
                    }
                    return fixTruncatedFullText(result);
                } catch(e) {
                    return await generateDefaultErrorResponse(config, originalCallback);
                }
            }

        } else {
            let result = {}

            let index = await this.LlamaCPP.GetInstance()
            if(this.LlamaCPP.Instances[index].ServerOn){
                result = await this.LlamaCPP.Instances[index].Generate(prompt, config, config.tokenCallback);
                if (result !== false) {
                    result = renameProperty(result,'content','full_text')
                }
            } else {
                let serveron_index = await this.WaitServerOn(index)
                if(serveron_index != -1){
                    result = await this.LlamaCPP.Instances[serveron_index].Generate(prompt, config, config.tokenCallback);
                    if (result !== false) {
                        result = renameProperty(result,'content','full_text')
                    }
                } else {
                    if(isStreaming){ 
                        return await generateDefaultErrorResponse(config, originalCallback);
                    }
                    result = { full_text: "Sorry, I'm unable to respond at the moment." };
                }
            }
            
            result = fixTruncatedFullText(result);
            
            return result;
        }
    }

    async Chat(messages = [{ role: 'user', content: 'Who won the world series in 2020?' }], config = {}) {
        const cleanMessages = messages
            .filter(msg => msg && msg.role && msg.content)
            .map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : String(msg.content)
            }))
            .filter(msg => {
                const isJsonStream = msg.content.includes('"full_text"') || 
                                    msg.content.includes('"stream"') ||
                                    msg.content.includes('"token"')
                if (isJsonStream) {
                    console.warn('Filtered out JSON stream data from message')
                    return false
                }
                return true
            })
        
        const limitedMessages = cleanMessages.slice(-20)
        
        const isStreaming = typeof config.tokenCallback === 'function' && isNonEmptyFunction(config.tokenCallback);
        config.stream = isStreaming;
        
        let streamAccumulator = null;
        let originalCallback = config.tokenCallback;
        
        if (isStreaming) {
            streamAccumulator = createStreamAccumulator(originalCallback);
            config.tokenCallback = streamAccumulator.wrappedCallback;
        }
        
        const fixTruncatedFullText = (result) => {
            if (result && typeof result === 'object' && streamAccumulator && streamAccumulator.hasText()) {
                const accumulatedText = streamAccumulator.getAccumulatedText();
                if (!result.full_text || accumulatedText.length > result.full_text.length) {
                    result.full_text = accumulatedText;
                }
            }
            return result;
        };
        
        if(this.ServerURL){
            let consume_result = await consumeChatRoute({
                serverUrl : this.ServerURL,
                port : this.ServerPORT,
                messages : limitedMessages,
                token : this.ServerTOKEN,
                config : config,
                onData : config.tokenCallback
            });
            
            consume_result = fixTruncatedFullText(consume_result);
            
            if(consume_result.error && (consume_result.error == 'server offline' || consume_result.error == 'Invalid token.')){
                if(isStreaming){ 
                    return await generateDefaultErrorResponse(config, originalCallback);
                }
                return { error: consume_result.error };
            }

            return consume_result;
        }

        if ((config.openai || this.OpenAI) && !config.deepinfra && !config.deepseek && !config.novitaai && !config.openai_avoidchat) {
            delete config.openai;
            let result = await this.OpenAI.Chat(limitedMessages, config);
            return fixTruncatedFullText(result);
        }

        if ((config.deepinfra || this.DeepInfra) && !config.deepseek && !config.novitaai && !config.deepinfra_avoidchat) {
            delete config.deepinfra;
            let result = await this.DeepInfra.Chat(limitedMessages, config);
            return fixTruncatedFullText(result);
        }
        
        if ((config.deepseek || this.DeepSeek) && !config.novitaai && !config.deepseek_avoidchat) {
            delete config.deepseek;
            let result = await this.DeepSeek.Chat(limitedMessages, config);
            return fixTruncatedFullText(result);
        }
        
        if ((config.novitaai || this.NovitaAI) && !config.novitaai_avoidchat) {
            delete config.novitaai;
            let result = await this.NovitaAI.Chat(limitedMessages, config);
            return fixTruncatedFullText(result);
        }
        
        if (this.DeepInfra) {
            let systemMessage = config.systemMessage;
            if (!systemMessage && config.systemType) {
                systemMessage = NewChatPrompt.SYSTEM_TYPES[config.systemType];
            }
            
            const final_prompt = NewChatPrompt.build(limitedMessages, systemMessage);
            
            return await this.Generate(final_prompt, {
                ...config,
                stop: ['<|im_end|>']
            });
        }
        
        if (this.DeepSeek) {
            let systemMessage = config.systemMessage;
            if (!systemMessage && config.systemType) {
                systemMessage = NewChatPrompt.SYSTEM_TYPES[config.systemType];
            }
            
            const final_prompt = NewChatPrompt.build(limitedMessages, systemMessage);
            
            return await this.Generate(final_prompt, {
                ...config,
                stop: ['<|im_end|>']
            });
        }
        
        if (this.NovitaAI) {
            let systemMessage = config.systemMessage;
            if (!systemMessage && config.systemType) {
                systemMessage = NewChatPrompt.SYSTEM_TYPES[config.systemType];
            }
            
            const final_prompt = NewChatPrompt.build(limitedMessages, systemMessage);
            
            return await this.Generate(final_prompt, {
                ...config,
                stop: ['<|im_end|>']
            });
        }
        
        let systemMessage = config.systemMessage;
        if (!systemMessage && config.systemType) {
            systemMessage = NewChatPrompt.SYSTEM_TYPES[config.systemType];
        }
        
        const final_prompt = NewChatPrompt.build(limitedMessages, systemMessage);
        
        return await this.Generate(final_prompt, {
            ...config,
            stop: ['<|im_end|>']
        });
    }

    async PrintGenerate(prompt){
        console.log((await this.Generate(prompt)).full_text)
    }    

    static Sleep = async (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static Server = EasyAI_Server

    static WebGPT = EasyAI_WebGPT
}

export default EasyAI;