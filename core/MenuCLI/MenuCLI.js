#!/usr/bin/env node

import TerminalHUD from "../TerminalHUD.js";
import StartMenu from "./StartMenu.js";
import ServerSaves from "./ServerSaves.js";
import ColorText from "../useful/ColorText.js";
import EasyAI from "../../EasyAI.js";
import ConfigManager from "../ConfigManager.js";
import PM2 from "../useful/PM2.js";

const MenuCLI = new TerminalHUD()

let server

export default MenuCLI


const args = process.argv.slice(2);

if (args.length > 0) {
    
    
    await ServerSaves.Load(args[0])
    .then(async (save) => {

        if (save.KillAllPM2) {
            await PM2.Delete('all')
        }

        if(save.PM2){
            await EasyAI.Server.PM2({token : save.Token,port : save.Port,EasyAI_Config : save.EasyAI_Config})
            console.log('✔️ PM2 Server iniciado com sucesso !')
            process.exit()
        } else {
            server = new EasyAI.Server({token : save.Token,port : save.Port,EasyAI_Config : save.EasyAI_Config})
            server.start()
        }
        

    }).catch(async e => {
        console.log(`Save ${ColorText.red(args[0])} não foi encontrado`)
        
        /*
        sem uso porém base para um sistema parecido pós instalação do package de forma fixa/firme no sistema 
        
        let key = ConfigManager.getKey('mode')

            if(key){
                switch (key) {
                    case '🥵':
                        process.exit() 
                    break;

                    case '⭐':
                        server = new EasyAI.Server()
                        server.start()   
                    break;

                    case '🚧':
                        server = new EasyAI.Server()
                        server.start()   
                    break;
                
                    case '⚒️':
                        server = new EasyAI.Server()
                        server.start()    
                    break;

                    default:
                        server = new EasyAI.Server()
                    server.start()
                    break
                    
                }
            }
                */

                let default_pm2 = ConfigManager.getKey('start-pm2')
                if(default_pm2 == true){
                    server = await EasyAI.Server.PM2()
                    console.log('✔️ PM2 Server iniciado com sucesso !')
                    process.exit()
                } else {
                    server = new EasyAI.Server()
                    server.start()
                }
               
            

    })

} else {
    MenuCLI.displayMenu(StartMenu);
}