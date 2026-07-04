#!/usr/bin/env node

import EasyAI from "../../EasyAI.js"
import PM2 from "../useful/PM2.js"
import TerminalHUD from "../TerminalHUD.js"
import ServerSaves from "../MenuCLI/ServerSaves.js"
import ColorText from '../useful/ColorText.js'
import ConfigManager from "../ConfigManager.js"
import FreePort from "../useful/FreePort.js"
import DeepInfra from "../DeepInfra.js"
import DeepSeek from "../DeepSeek.js"
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let webgpt_process_name
let ai_process_name

process.on('exit',async () => {
    // This cleanup only runs if the script exits abnormally
    // Normally, PM2 manages the processes
})

// Helper function to restart a PM2 process using pm2 command directly
async function restartPM2Process(processName, processType) {
    if (!processName) return false;
    
    try {
        console.log(`Restarting ${processType}: ${processName}...`);
        const { stdout } = await execAsync(`pm2 restart ${processName}`);
        console.log(stdout.trim());
        return true;
    } catch (error) {
        console.log(`⚠️ Failed to restart ${processType}: ${error.message}`);
        return false;
    }
}

// Handle restart functionality
async function handleRestart(fromMenu = false) {
    const webgptProcess = ConfigManager.getKey('flash_webgpt_process')
    const aiProcess = ConfigManager.getKey('flash_webgpt_aiprocess')
    
    if (webgptProcess || aiProcess) {
        if (!fromMenu) console.log('🔄 Restarting WebGPT processes...');
        
        let restartSuccess = false;
        
        if (webgptProcess) {
            const processExists = await PM2.Process(webgptProcess);
            if (processExists) {
                const success = await restartPM2Process(webgptProcess, 'WebGPT');
                if (success) {
                    console.log(`✔️ WebGPT process restarted: ${webgptProcess}`);
                    restartSuccess = true;
                }
            } else {
                console.log(`⚠️ WebGPT process ${webgptProcess} not found in PM2`);
                console.log('Cleaning up invalid config...');
                ConfigManager.deleteKey('flash_webgpt_process');
            }
        }
        
        if (aiProcess) {
            const processExists = await PM2.Process(aiProcess);
            if (processExists) {
                const success = await restartPM2Process(aiProcess, 'AI Server');
                if (success) {
                    console.log(`✔️ AI Server process restarted: ${aiProcess}`);
                    restartSuccess = true;
                }
            } else {
                console.log(`⚠️ AI Server process ${aiProcess} not found in PM2`);
                console.log('Cleaning up invalid config...');
                ConfigManager.deleteKey('flash_webgpt_aiprocess');
            }
        }
        
        // After cleanup, check if any processes remain
        const remainingWebgpt = ConfigManager.getKey('flash_webgpt_process');
        const remainingAi = ConfigManager.getKey('flash_webgpt_aiprocess');
        
        if (!remainingWebgpt && !remainingAi) {
            if (!fromMenu) {
                console.log('No active processes found. Starting a new instance...');
                const args = process.argv.slice(2);
                const nonRestartArgs = args.filter(arg => !['-r', '--r', '--restart'].includes(arg));
                await startWebGPT(nonRestartArgs);
                return true;
            }
        }
        
        if (restartSuccess) {
            console.log('✅ Restart complete!');
        }
        
        return restartSuccess;
    } else {
        if (!fromMenu) {
            console.log('No WebGPT processes found. Starting a new instance...');
            const args = process.argv.slice(2);
            const nonRestartArgs = args.filter(arg => !['-r', '--r', '--restart'].includes(arg));
            await startWebGPT(nonRestartArgs);
            return true;
        } else {
            console.log('❌ No WebGPT processes found to restart');
            console.log('💡 Start a WebGPT instance first with: flash_webgpt [model/save]');
            return false;
        }
    }
}

// Extract the startup logic into a reusable function
async function startWebGPT(argsToUse) {
    if (argsToUse.length > 0 || ConfigManager.getKey('defaultwebgptsave')) {
        let toload = (argsToUse.length > 0) ? argsToUse[0] : ConfigManager.getKey('defaultwebgptsave')
        
        if(toload.toLowerCase() == 'openai' || toload.toLowerCase() == 'deepinfra' || toload.toLowerCase() == 'deepseek'){
            if((ConfigManager.getKey('openai') && toload.toLowerCase() == 'openai') || 
               (ConfigManager.getKey('deepinfra') && toload.toLowerCase() == 'deepinfra') ||
               (ConfigManager.getKey('deepseek') && toload.toLowerCase() == 'deepseek')){
                
                if(toload.toLowerCase() == 'openai' && ConfigManager.getKey('openai')){
                    let openai_info = ConfigManager.getKey('openai')
                    let port = await FreePort(3000)
                    webgpt_process_name = await EasyAI.WebGPT.PM2({
                        port: port,
                        openai_token: openai_info.token, 
                        openai_model: openai_info.model
                    })
                    ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                    console.log('✔️ WebGPT Server iniciado com sucesso com OpenAI!')
                    console.log(`📡 Process ID: ${webgpt_process_name}`)
                    console.log('💡 Use -r flag to restart: flash_webgpt -r')
                    process.exit(0)
                    
                } else if (toload.toLowerCase() == 'deepinfra' && ConfigManager.getKey('deepinfra')) {
                    let deepinfra_info = ConfigManager.getKey('deepinfra')
                    let port = await FreePort(3000)
                    webgpt_process_name = await EasyAI.WebGPT.PM2({
                        port: port,
                        deepinfra_token: deepinfra_info.token, 
                        deepinfra_model: deepinfra_info.model
                    })
                    ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                    console.log('✔️ WebGPT Server iniciado com sucesso com DeepInfra!')
                    console.log(`📡 Process ID: ${webgpt_process_name}`)
                    console.log('💡 Use -r flag to restart: flash_webgpt -r')
                    process.exit(0)
                    
                } else if (toload.toLowerCase() == 'deepseek' && ConfigManager.getKey('deepseek')) {
                    let deepseek_info = ConfigManager.getKey('deepseek')
                    let port = await FreePort(3000)
                    webgpt_process_name = await EasyAI.WebGPT.PM2({
                        port: port,
                        deepseek_token: deepseek_info.token, 
                        deepseek_model: deepseek_info.model
                    })
                    ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                    console.log('✔️ WebGPT Server iniciado com sucesso com DeepSeek!')
                    console.log(`📡 Process ID: ${webgpt_process_name}`)
                    console.log('💡 Use -r flag to restart: flash_webgpt -r')
                    process.exit(0)
                }
            } else {
                // Handle case where config doesn't exist
                let cli = new TerminalHUD()
                let final_object = {}

                if(toload.toLowerCase() == 'openai'){
                    final_object.token = await cli.ask('OpenAI Token: ')
                    final_object.model = await cli.ask('Select the model', {
                        options: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo-instruct']
                    })
                    let save = await cli.ask('Save the OpenAI config? ', {
                        options: ['yes', 'no']
                    })
                    if(save == 'yes'){
                        ConfigManager.setKey('openai', final_object)
                    }
                    cli.close()
                    console.clear()
                    
                    let port = await FreePort(3000)
                    webgpt_process_name = await EasyAI.WebGPT.PM2({
                        port: port,
                        openai_token: final_object.token, 
                        openai_model: final_object.model
                    })
                    ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                    console.log('✔️ WebGPT Server iniciado com sucesso com OpenAI!')
                    console.log(`📡 Process ID: ${webgpt_process_name}`)
                    console.log('💡 Use -r flag to restart: flash_webgpt -r')
                    process.exit(0)
                    
                } else if(toload.toLowerCase() == 'deepinfra'){
                    final_object.token = await cli.ask('DeepInfra Token: ')
                    final_object.model = await cli.ask('Select the model', {
                        options: DeepInfra.Models
                    })
                    let save = await cli.ask('Save the DeepInfra config? ', {
                        options: ['yes', 'no']
                    })
                    if(save == 'yes'){
                        ConfigManager.setKey('deepinfra', final_object)
                    }
                    cli.close()
                    console.clear()
                    
                    let port = await FreePort(3000)
                    webgpt_process_name = await EasyAI.WebGPT.PM2({
                        port: port,
                        deepinfra_token: final_object.token, 
                        deepinfra_model: final_object.model
                    })
                    ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                    console.log('✔️ WebGPT Server iniciado com sucesso com DeepInfra!')
                    console.log(`📡 Process ID: ${webgpt_process_name}`)
                    console.log('💡 Use -r flag to restart: flash_webgpt -r')
                    process.exit(0)
                    
                } else if(toload.toLowerCase() == 'deepseek'){
                    final_object.token = await cli.ask('DeepSeek Token: ')
                    final_object.model = await cli.ask('Select the model', {
                        options: DeepSeek.Models
                    })
                    let save = await cli.ask('Save the DeepSeek config? ', {
                        options: ['yes', 'no']
                    })
                    if(save == 'yes'){
                        ConfigManager.setKey('deepseek', final_object)
                    }
                    cli.close()
                    console.clear()
                    
                    let port = await FreePort(3000)
                    webgpt_process_name = await EasyAI.WebGPT.PM2({
                        port: port,
                        deepseek_token: final_object.token, 
                        deepseek_model: final_object.model
                    })
                    ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                    console.log('✔️ WebGPT Server iniciado com sucesso com DeepSeek!')
                    console.log(`📡 Process ID: ${webgpt_process_name}`)
                    console.log('💡 Use -r flag to restart: flash_webgpt -r')
                    process.exit(0)
                }
            }
        } else {
            // Handle saved server configuration
            await ServerSaves.Load(toload)
            .then(async (save) => {
                // Start the AI server first
                ai_process_name = await EasyAI.Server.PM2({
                    token: save.Token,
                    port: save.Port,
                    EasyAI_Config: save.EasyAI_Config
                })
                ConfigManager.setKey('flash_webgpt_aiprocess', ai_process_name)
                console.log('✔️ PM2 Server iniciado com sucesso!')
                
                // Then start WebGPT pointing to it
                let webgpt_port = save.Webgpt_Port || await FreePort(3000)
                webgpt_process_name = await EasyAI.WebGPT.PM2({
                    port: webgpt_port,
                    easyai_url: 'localhost',
                    easyai_port: save.Port
                })
                ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                console.log('✔️ WebGPT Server iniciado com sucesso!')
                console.log(`📡 WebGPT Process: ${webgpt_process_name}`)
                console.log(`📡 AI Server Process: ${ai_process_name}`)
                console.log('💡 Use -r flag to restart: flash_webgpt -r')
                process.exit(0)
            }).catch(async e => {
                console.log(`Save ${ColorText.red(argsToUse[0])} não foi encontrado`)
                
                // Default fallback: start both servers
                let ai_port = await FreePort(4000)
                ai_process_name = await EasyAI.Server.PM2({
                    handle_port: false,
                    port: ai_port
                })
                ConfigManager.setKey('flash_webgpt_aiprocess', ai_process_name)
                
                let webgpt_port = await FreePort(3000)
                webgpt_process_name = await EasyAI.WebGPT.PM2({
                    port: webgpt_port,
                    easyai_url: 'localhost',
                    easyai_port: ai_port
                })
                ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
                console.log('✔️ Servers iniciados com sucesso!')
                console.log(`📡 WebGPT Process: ${webgpt_process_name}`)
                console.log(`📡 AI Server Process: ${ai_process_name}`)
                console.log('💡 Use -r flag to restart: flash_webgpt -r')
                process.exit(0)
            })
        }
    } else {
        // Default case: start local server and WebGPT
        let ai_port = await FreePort(4000)
        ai_process_name = await EasyAI.Server.PM2({
            handle_port: false,
            port: ai_port
        })
        ConfigManager.setKey('flash_webgpt_aiprocess', ai_process_name)
        
        let webgpt_port = await FreePort(3000)
        webgpt_process_name = await EasyAI.WebGPT.PM2({
            port: webgpt_port,
            easyai_url: 'localhost',
            easyai_port: ai_port
        })
        ConfigManager.setKey('flash_webgpt_process', webgpt_process_name)
        console.log('✔️ Servers iniciados com sucesso!')
        console.log(`📡 WebGPT Process: ${webgpt_process_name}`)
        console.log(`📡 AI Server Process: ${ai_process_name}`)
        console.log('💡 Use -r flag to restart: flash_webgpt -r')
        process.exit(0)
    }
}

const args = process.argv.slice(2);

// Check for restart flags (-r, --r, --restart)
const restartFlags = ['-r', '--r', '--restart'];
const shouldRestart = args.some(arg => restartFlags.includes(arg));

if (shouldRestart) {
    await handleRestart(false);
    process.exit(0);
}

// Check if there are active processes by verifying with PM2
const webgptProcess = ConfigManager.getKey('flash_webgpt_process');
const aiProcess = ConfigManager.getKey('flash_webgpt_aiprocess');
let hasActiveProcess = false;

if (webgptProcess) {
    const webgptExists = await PM2.Process(webgptProcess);
    if (webgptExists) {
        hasActiveProcess = true;
    } else {
        // Clean up invalid config
        ConfigManager.deleteKey('flash_webgpt_process');
    }
}

if (aiProcess) {
    const aiExists = await PM2.Process(aiProcess);
    if (aiExists) {
        hasActiveProcess = true;
    } else {
        // Clean up invalid config
        ConfigManager.deleteKey('flash_webgpt_aiprocess');
    }
}

if(hasActiveProcess){
    let cli = new TerminalHUD()

    let menu = () => ({
        title : 'Flash WebGPT',
        options : [
            {
            name : '🔄 Restart Webgpt',
            action : async () =>{
                console.clear()
                console.log('🔄 Restarting WebGPT processes...')
                
                await handleRestart(true);
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.clear();
                
                // Check if any processes still exist before showing menu
                if (ConfigManager.getKey('flash_webgpt_process') || ConfigManager.getKey('flash_webgpt_aiprocess')) {
                    cli.displayMenu(menu);
                } else {
                    console.log('No active processes. Exiting...');
                    process.exit(0);
                }
            }
            },
            {
            name : '❌ Close Webgpt',
            action : async () =>{
                console.clear()
                await PM2.Delete(ConfigManager.getKey('flash_webgpt_process')).catch(e => {})
                await PM2.Delete(ConfigManager.getKey('flash_webgpt_aiprocess')).catch(e => {})
                ConfigManager.deleteKey('flash_webgpt_aiprocess')
                ConfigManager.deleteKey('flash_webgpt_process')
                console.clear()
                console.log('Done.')
                process.exit()
            }
            },
            {
            name : 'Exit',
            action : () => {
                console.clear()
                process.exit()
                }
            }

        ]
    })

    cli.displayMenu(menu)

} else {
    // No active processes, start fresh
    await startWebGPT(args);
}