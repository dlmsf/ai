import EasyAI from '../../../EasyAI.js'
import StartMenu from '../StartMenu.js'
import MenuCLI from '../MenuCLI.js'
import TerminalChat from '../../TerminalChat.js'
import readline from 'readline';
import Chat from '../../ChatModule/Chat.js'
import TerminalGenerate from '../../TerminalGenerate.js'
import ColorText from '../../useful/ColorText.js'
import PM2 from '../../useful/PM2.js'
import FreePort from '../../useful/FreePort.js'
import ChatHUD from '../../ChatHUD.js';

let webgpt_processname

process.on('exit',async () => {
    if(webgpt_processname){
        await PM2.Delete(webgpt_processname)
    }
})

const SandboxMenu = async (props) => ({
    title : `☕ Sandbox | ${
        props.openai_token ? `OpenAI ${props.openai_model ? `(${ColorText.cyan(props.openai_model)})` : ''}` : 
        props.deepinfra_token ? `DeepInfra ${props.deepinfra_model ? `(${ColorText.cyan(props.deepinfra_model)})` : ''}` : 
        props.deepseek_token ? `DeepSeek ${props.deepseek_model ? `(${ColorText.cyan(props.deepseek_model)})` : ''}` : 
        `${props.server_url}${(props.server_port) ? `:${props.server_port}` : ''}`
    }`,
options : [
    {
    name : ColorText.brightBlue('Generate'),
    action : async () => {
        MenuCLI.close()
        console.clear()
        let ai = new EasyAI(props)
        new TerminalGenerate(async (input,display) => {
           let result = await ai.Generate(input, {
               tokenCallback : async (token) => {
                   await display(token.stream.content)
               },
               ...(props.openai_token ? {openai: true} : {}),
               ...(props.deepinfra_token ? {deepinfra: true} : {}),
               ...(props.deepseek_token ? {deepseek: true} : {})
           })
        },{exitFunction : async () => {
            MenuCLI.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
              });
            await MenuCLI.displayMenu(SandboxMenu,{props : props})
        }})
    }
    },
    // Updated Chat action in SandboxMenu
// In SandboxMenu.js - Chat action
{
    name: ColorText.brightBlue('Chat'),
    action: async () => {
        MenuCLI.close()
        console.clear()
        let ai = new EasyAI(props)
        const chat = new Chat()
        
        new TerminalChat(async (input, displayToken) => {
            // Add user message to chat history
            chat.NewMessage('user', input)
            
            // Store the complete response as we build it
            let fullResponse = ''
            
            const result = await ai.Chat(chat.Historical, {  // Pass the historical messages directly
                tokenCallback: async (token) => {
                    // Handle token in various formats
                    let content = ''
                    if (typeof token === 'string') {
                        content = token
                    } else if (token?.stream?.content) {
                        content = token.stream.content
                    } else if (token?.content) {
                        content = token.content
                    }
                    
                    if (content) {
                        fullResponse += content
                        await displayToken(content)
                    }
                },
                stream: true,
                systemMessage: props.systemMessage,
                systemType: props.systemType
            })
            
            // Add ONLY the clean text response to chat history
            if (fullResponse) {
                chat.NewMessage('assistant', fullResponse)
            } else if (result?.full_text) {
                chat.NewMessage('assistant', result.full_text)
            }
            
        }, {
            exitFunction: async () => {
                MenuCLI.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                await MenuCLI.displayMenu(SandboxMenu, { props: props })
            }
        })
    }
},
{
    name: ColorText.magenta('Chat (New)'),
    action: async () => {
        MenuCLI.close()
        console.clear()
        let ai = new EasyAI(props)
        const chat = new Chat()
        
        // Track messages for context
        let messageHistory = []
        
        // Create a message processor function for ChatHUD
        const messageProcessor = async (triggerMessage, displayToken, allMessages = [triggerMessage]) => {
            
            // Add ALL messages that were sent while bot was busy to history
            for (const msg of allMessages) {
                // Check if message is already in history to avoid duplicates
                const lastUserMsg = messageHistory.filter(m => m.role === 'user').pop()
                if (!lastUserMsg || lastUserMsg.content !== msg) {
                    chat.NewMessage('user', msg)
                    messageHistory.push({ role: 'user', content: msg })
                }
            }
            
            // Store the complete response as we build it
            let fullResponse = ''
            
            // Generate response with ALL messages in context
            const result = await ai.Chat(chat.Historical, {
                tokenCallback: async (token) => {
                    // Handle token in various formats
                    let content = ''
                    if (typeof token === 'string') {
                        content = token
                    } else if (token?.stream?.content) {
                        content = token.stream.content
                    } else if (token?.content) {
                        content = token.content
                    }
                    
                    if (content) {
                        fullResponse += content
                        await displayToken(content)
                    }
                },
                stream: true,
                systemMessage: props.systemMessage,
                systemType: props.systemType
            })
            
            // Add the response to chat history
            if (fullResponse) {
                chat.NewMessage('assistant', fullResponse)
                messageHistory.push({ role: 'assistant', content: fullResponse })
            } else if (result?.full_text) {
                chat.NewMessage('assistant', result.full_text)
                messageHistory.push({ role: 'assistant', content: result.full_text })
            }
            
            return fullResponse
        }
        
        // Configure ChatHUD with custom settings
        const chatHUD = new ChatHUD({
            messageProcessor: messageProcessor,
            colors: {
                border: '\x1b[38;5;39m',
                title: '\x1b[1;38;5;220m',
                user: '\x1b[32m',
                userText: '\x1b[37m',
                bot: '\x1b[36m',
                botText: '\x1b[35m',
                system: '\x1b[33m',
                systemText: '\x1b[37m',
                timestamp: '\x1b[90m',
                prompt: '\x1b[38;5;220m',
                cursor: '\x1b[48;5;220;30m',
                botIndicator: '\x1b[3;90m'
            },
            messages: {
                welcome: '🚀 Welcome to the New Terminal Chat!',
                initialBot: 'Hello! How can I help you today?',
                goodbye: '\n✨ Chat ended. Returning to menu... ✨'
            },
            onExit: (instance) => {
                instance.cleanup()
                MenuCLI.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                MenuCLI.displayMenu(SandboxMenu, { props: props })
            },
            title : 'EasyAI'
        })
        
        // Add a one-time handler for this specific chat instance
        const sigintHandler = () => {
            chatHUD.cleanup();
            process.removeListener('SIGINT', sigintHandler);
        };
        process.once('SIGINT', sigintHandler);
        
        // Start the chat
        chatHUD.start();
    }
},
    {
    name : ColorText.blue('Coder'),
    action : async () => {
        await MenuCLI.displayMenu(SandboxMenu,{props : props})
        }
    },
    {
    name : ColorText.blue('AgentFlow'),
    action : async () => {
        await MenuCLI.displayMenu(SandboxMenu,{props : props})
          }
    },
    {
        name : `${ColorText.brightBlue('WebGPT Server')} | ${(await PM2.Process(webgpt_processname)) ? ColorText.green('ON') : ColorText.red('OFF')}`,
        action : async () => {

            if(await PM2.Process(webgpt_processname)){
                await PM2.Delete(webgpt_processname)
                webgpt_processname = undefined
                MenuCLI.displayMenu(SandboxMenu,{props : props,alert_emoji : '✔️',alert : 'WebGPT PM2 Server finalizado'})
            } else {
                let port = await FreePort(3000)
                webgpt_processname = await EasyAI.WebGPT.PM2({
                    port : port,
                    easyai_url : props.server_url,
                    easyai_port : props.server_port,
                    easyai_token : props.server_token,
                    openai_token : props.openai_token,
                    openai_model : props.openai_model,
                    deepinfra_token : props.deepinfra_token,
                    deepinfra_model : props.deepinfra_model,
                    deepseek_token : props.deepseek_token,
                    deepseek_model : props.deepseek_model
                })
                MenuCLI.displayMenu(SandboxMenu,{props : props,alert_emoji : '✔️',alert : 'WebGPT PM2 Server iniciado com sucesso !'})
            }
        }
    },
    {
        name : '← Back',
        action : () => {
            MenuCLI.displayMenu(StartMenu)
            }
        }
     ]

})

export default SandboxMenu