#!/usr/bin/env node

import EasyAI from "../../EasyAI.js"
import PM2 from "../useful/PM2.js"
import TerminalHUD from "../TerminalHUD.js"
import ServerSaves from "../MenuCLI/ServerSaves.js"
import ColorText from '../useful/ColorText.js'
import ConfigManager from "../ConfigManager.js"
import FreePort from "../useful/FreePort.js"
import DeepInfra from "../DeepInfra.js"

let webgpt_process_name
let ai_process_name

process.on('exit',async () => {
    // This cleanup only runs if the script exits abnormally
    // Normally, PM2 manages the processes
})

if(ConfigManager.getKey('flash_webgpt_aiprocess') || ConfigManager.getKey('flash_webgpt_process')){
    let cli = new TerminalHUD()

    let menu = () => ({
        title : 'Flash WebGPT',
        options : [
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

const args = process.argv.slice(2);

if (args.length > 0 || ConfigManager.getKey('defaultwebgptsave')) {
    let toload = (args.length > 0) ? args[0] : ConfigManager.getKey('defaultwebgptsave')
    
    if(toload.toLowerCase() == 'openai' || toload.toLowerCase() == 'deepinfra'){
        if((ConfigManager.getKey('openai') && toload.toLowerCase() == 'openai') || 
           (ConfigManager.getKey('deepinfra') && toload.toLowerCase() == 'deepinfra')){
            
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
            process.exit(0)
        }).catch(async e => {
            console.log(`Save ${ColorText.red(args[0])} não foi encontrado`)
            
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
    process.exit(0)
}

}