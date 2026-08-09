#!/usr/bin/env node

import EasyAI from "../../EasyAI.js"
import TerminalGenerate from "../TerminalGenerate.js"
import PM2 from "../useful/PM2.js"
import ServerSaves from "../MenuCLI/ServerSaves.js"
import ColorText from '../useful/ColorText.js'
import ConfigManager from "../ConfigManager.js"
import TerminalHUD from "../TerminalHUD.js"
import ModelsList from '../MenuCLI/ModelsList.js'
import FreePort from "../useful/FreePort.js"

let ai
let process_name
let port

process.on('exit',() =>{console.clear()})

const StartGenerate = (ai,process_name) => {
        console.clear()

        new TerminalGenerate(async (input,display) => {
           await ai.Generate(input,{tokenCallback : async (token) =>{await display(token.stream.content)}})
        },{exitFunction : async () => {
            if(process_name){
                await PM2.Delete(process_name)
                }
                console.clear()
                process.exit(0)
        }})
}

let models_options = async () => {
    let final_array = []
    let saves_array = await ModelsList()
    saves_array.forEach(e => {
        final_array.push({
            name : `${e.name} | ${e.size} GB`,
            action : async () => {
              
               let model = `./models/${e.name}`
               port = await FreePort(4000)
               process_name = await EasyAI.Server.PM2({handle_port : false,port : port,EasyAI_Config :{llama : {llama_model : model}}})
                
                }
            })
    })
final_array.push({
    name : 'Exit',
    action : () => {
        console.clear()
        process.exit()
        }
    })
return final_array
}

const FastModel = async () => ({

    options : await models_options()

})

const args = process.argv.slice(2);

if (args.length > 0 || ConfigManager.getKey('defaultgeneratesave')) {
    let toload = (args.length > 0) ? args[0] : ConfigManager.getKey('defaultgeneratesave')
    if(toload.toLowerCase() == 'openai'){
        if(ConfigManager.getKey('openai')){
            let openai_info = ConfigManager.getKey('openai')
            ai = new EasyAI({openai_token : openai_info.token, openai_model : openai_info.model})
            StartGenerate(ai)
        } else {
            let cli = new TerminalHUD()
            let final_object = {}
            final_object.token = await cli.ask('OpenAI Token : ')
            final_object.model = await cli.ask('Select the model',{options : ['gpt-3.5-turbo','gpt-4','gpt-4-turbo-preview','gpt-3.5-turbo-instruct']})
            let save = await cli.ask('Save the OpenAI config? ',{options : ['yes','no']})
            if(save == 'yes'){ConfigManager.setKey('openai',final_object)}
            cli.close(
            console.clear()
            )
            ai = new EasyAI({openai_token : final_object.token, openai_model : final_object.model})
            StartGenerate(ai)
        }
    } else {
    await ServerSaves.Load(toload)
    .then(async (save) => {

            if (save.KillAllPM2) {
                await PM2.Delete('all')
            }

            process_name = await EasyAI.Server.PM2({handle_port : false,token : save.Token,port : save.Port,EasyAI_Config : save.EasyAI_Config})
            console.log('✔️ PM2 Server iniciado com sucesso !')
            ai = new EasyAI({server_url : 'localhost',server_port : save.Port})
            StartGenerate(ai,process_name)

    }).catch(async e => {
        if(args[0] == "models"){
            let cli = new TerminalHUD()
            await cli.displayMenu(FastModel)
            cli.close()
            ai = new EasyAI({server_url : 'localhost',server_port : port})
            StartGenerate(ai,process_name)
        } else { 
            console.log(`Save ${ColorText.red(args[0])} não foi encontrado`)
            port = await FreePort(4000)
            process_name = await EasyAI.Server.PM2({handle_port : false,port : port})
            ai = new EasyAI({server_url : 'localhost',server_port : port})
            StartGenerate(ai,process_name)
        }
    })
}
} else {
    port = await FreePort(4000)
    process_name = await EasyAI.Server.PM2({handle_port : false,port : port})
    ai = new EasyAI({server_url : 'localhost',server_port : port})
    StartGenerate(ai,process_name)
}