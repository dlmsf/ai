import EasyAI from '../../EasyAI.js'
import StartMenu from './StartMenu.js'
import MenuCLI from './MenuCLI.js'
import ServerSaves from './ServerSaves.js'
import ModelsList from './ModelsList.js'
import ColorText from '../useful/ColorText.js'
import ConfigManager from '../ConfigManager.js'
import PM2 from '../useful/PM2.js'
import DeepInfra from '../DeepInfra.js'

let easyai_config = {}
let easyai_token = undefined
let easyai_port = 4000
let webgpt_port = 3000
let withPM2 = false

let models_options = async () => {
    let final_array = []
    let saves_array = await ModelsList()
    saves_array.forEach(e => {
        final_array.push({
            name : `${e.name} | ${e.size} GB`,
            action : async () => {
                if(easyai_config.llama){
                    easyai_config.llama.llama_model = `./models/${e.name}`
                } else {
                    easyai_config.llama = {}
                    easyai_config.llama.llama_model = `./models/${e.name}`
                }
                MenuCLI.displayMenu(CustomServer)
                }
            })
    })
final_array.push({
    name : '← Back',
    action : () => {
        MenuCLI.displayMenu(CustomServer)
        }
    })
return final_array
}

let save_options = async (config = {}) => {
    let final_array = []
    let saves_array = await ServerSaves.List()
    saves_array.forEach(e => {
        final_array.push({
            name : `${config.delmenu ? '❌ ' : (config.renmenu ? '🖊️ ' : '')}${e}`,
            action : async () => {
                if(!Object.keys(config).length){
                let save = await ServerSaves.Load(e)
                easyai_config = save.EasyAI_Config || {}
                easyai_port = save.Port || 4000
                webgpt_port = save.Webgpt_Port || 3000
                easyai_token = save.Token || undefined
                withPM2 = save.PM2
                MenuCLI.displayMenu(CustomServer)
                } else if (config.delmenu) {
                    let response = await MenuCLI.displayMenuFromOptions(`Confirm delete of ${ColorText.cyan(e)}? This is ${ColorText.red('irreversible.')}`,[ColorText.green('yes'),ColorText.red('no')])
                    if(response == ColorText.green('yes')){await ServerSaves.Delete(e)}  
                    MenuCLI.displayMenu(SavesMenu,{props : {options : await save_options({delmenu : true})}})
                } else if (config.renmenu){
                    let response = await MenuCLI.ask('Type the new name : ')
                    await ServerSaves.Rename(e,response)
                    .then(async e => {
                        MenuCLI.displayMenu(SavesMenu,{props : {alert : '✔️ Save renamed sucessfully !',options : await save_options({renmenu : true})}})
                    })
                    .catch(async e => [
                        MenuCLI.displayMenu(SavesMenu,{props : {alert : 'Error',options : await save_options({renmenu : true})}})
                    ])
                }

                }
            })
    })
if(!Object.keys(config).length){
    final_array.push({
        type : 'options',
        value : [{
            name : '❌ Remove Save',
            action : async () => {
                MenuCLI.displayMenu(SavesMenu,{props : {options : await save_options({delmenu : true})}})
                }
            },
            {
                name : '🖊️  Rename Save',
                action : async () => {
                    MenuCLI.displayMenu(SavesMenu,{props : {options : await save_options({renmenu : true})}})
                    }
                }
        
        ]
    })
}
final_array.push({
    name : `← Back ${config.delmenu ? '- Carregar Save' : ''}`,
    action : async () => {
        if(!config.delmenu && !config.renmenu){MenuCLI.displayMenu(ServerMenu)} else {MenuCLI.displayMenu(SavesMenu,{props : {options : await save_options()}})}
        }
    })
return final_array
}

const CustomServer = (props) => ({
    title : `• EasyAI Server / Custom`,
options : [
    {
    name : ColorText.yellow('⚡ Start ⚡'),
    action : async () => {

        if(withPM2){
            await EasyAI.Server.PM2({token : easyai_token,port : easyai_port,EasyAI_Config : easyai_config})
            MenuCLI.displayMenu(ServerMenu,{alert_emoji : '✔️',alert : 'PM2 Server iniciado com sucesso !'})

        } else {
            console.clear()
            let server = new EasyAI.Server({token : easyai_token,port : easyai_port,EasyAI_Config : easyai_config})
            server.start()
        }
    }
    },
    {
        name : `EasyAI PORT | ${easyai_port}`,
        action : async () => {
            let newport = await MenuCLI.ask('Digite a nova PORTA : ')
            easyai_port = Number(newport)
            MenuCLI.displayMenu(CustomServer)    
        }
    },
    {
        name : (easyai_token) ? ColorText.green('Access Token') : ColorText.red('Access Token'),
        action : async  () => {
            if(easyai_token){
                let response = await MenuCLI.ask('Edit Server Access Token', {options : ['New Token', 'Clear Token', 'Cancel']})
                switch (response) {
                    case 'New Token':
                        let token =  await MenuCLI.ask('Set new token : ')
                        easyai_token = token
                        MenuCLI.displayMenu(CustomServer)
                    break;

                    case 'Clear Token':
                        easyai_token = undefined
                        MenuCLI.displayMenu(CustomServer)
                    break;
                
                    default:
                        MenuCLI.displayMenu(CustomServer)
                    break;
                }
            } else {
                let token =  await MenuCLI.ask('Set Server Access Token : ')
                easyai_token = token
                MenuCLI.displayMenu(CustomServer)
            }
        }
    },
    {
        name : `LlamaCPP PORT | ${easyai_config.llama ? (easyai_config.llama.server_port ? easyai_config.llama.server_port : '8080') : '8080'}`,
        action : async () => {
            let newport = await MenuCLI.ask('Digite a nova PORTA : ')
            if(easyai_config.llama){
                easyai_config.llama.server_port = Number(newport)
            } else {
                easyai_config.llama = {}
                easyai_config.llama.server_port = Number(newport)
            }
            MenuCLI.displayMenu(CustomServer) 
        }
    },
    {
        name : `Webgpt PORT | ${webgpt_port}`,
        action : async () => {
            let newport = await MenuCLI.ask('Digite a nova PORTA : ')
            webgpt_port = Number(newport)
            MenuCLI.displayMenu(CustomServer)    
        }
    },
    {
        name : `PM2 | ${withPM2 ? ColorText.green('ON') : ColorText.red('OFF')}`,
        action : async () => {
            withPM2 = !withPM2
            MenuCLI.displayMenu(CustomServer) 
        }
    },
    {
        name : `🔌 EasyAI | ${easyai_config.server_url ? ColorText.green(`${easyai_config.server_url}:${easyai_config.server_port}`) : ColorText.red('Not Configured')}`,
        action : async () => {
            // Check if already configured
            if(easyai_config.server_url) {
                // Show edit/clear options
                let response = await MenuCLI.ask('EasyAI Connection', {options : [
                    'Edit Configuration',
                    'Clear Configuration',
                    'Cancel'
                ]})
                
                switch(response) {
                    case 'Edit Configuration':
                        // Edit flow with current values as defaults
                        let url = await MenuCLI.ask(`Server URL (default: ${easyai_config.server_url}) : `)
                        if(!url) url = easyai_config.server_url
                        
                        let portStr = await MenuCLI.ask(`Server Port (default: ${easyai_config.server_port}) : `)
                        let port = portStr ? Number(portStr) : easyai_config.server_port
                        
                        easyai_config.server_url = url
                        easyai_config.server_port = port
                        
                        // Token handling for the EasyAI connection (server_token)
                        let tokenPrompt = easyai_config.server_token ? 
                            `Access Token (current: ${easyai_config.server_token}) - Enter to keep, type NEW value or "clear" to remove : ` :
                            'Access Token (optional) : '
                        
                        let token = await MenuCLI.ask(tokenPrompt)
                        if(token === 'clear') {
                            delete easyai_config.server_token
                        } else if(token) {
                            easyai_config.server_token = token
                        }
                        // If empty string, keep existing token
                        
                        // Clear other configs
                        delete easyai_config.openai_token
                        delete easyai_config.openai_model
                        delete easyai_config.deepinfra_token
                        delete easyai_config.deepinfra_model
                        delete easyai_config.llama
                        
                        MenuCLI.displayMenu(CustomServer)
                        break
                        
                    case 'Clear Configuration':
                        delete easyai_config.server_url
                        delete easyai_config.server_port
                        delete easyai_config.server_token
                        MenuCLI.displayMenu(CustomServer)
                        break
                        
                    default:
                        MenuCLI.displayMenu(CustomServer)
                        break
                }
            } else {
                // New configuration flow with defaults
                let url = await MenuCLI.ask('Server URL (default: localhost) : ')
                if(!url) url = 'localhost'
                
                let portStr = await MenuCLI.ask('Server Port (default: 4000) : ')
                let port = portStr ? Number(portStr) : 4000
                
                easyai_config.server_url = url
                easyai_config.server_port = port
                
                let token = await MenuCLI.ask('Access Token (optional) : ')
                if(token) {
                    easyai_config.server_token = token
                }
                
                // Clear other configs
                delete easyai_config.openai_token
                delete easyai_config.openai_model
                delete easyai_config.deepinfra_token
                delete easyai_config.deepinfra_model
                delete easyai_config.llama
                
                MenuCLI.displayMenu(CustomServer)
            }
        }
    },
    {
        name : `${ConfigManager.getKey('openai') ? `🌐 ${ColorText.green('OpenAI')}` : `🌐 ${ColorText.red('OpenAI')}`} | ${easyai_config.openai_token ? ColorText.green('ON') : ColorText.red('OFF')}`,
        action : async () => {
            // Check if currently enabled (has token)
            if(!easyai_config.openai_token) {
                // Turning ON - need to configure
                if(ConfigManager.getKey('openai')){
                    let obj = ConfigManager.getKey('openai')
                    
                    let response = await MenuCLI.ask('OpenAI Configuration', {options : [
                        `Use with current model (${ColorText.green(obj.model)})`,
                        'Change model',
                        'Edit token',
                        'Clear configuration',
                        'Cancel'
                    ]})
                    
                    switch(response) {
                        case `Use with current model (${ColorText.green(obj.model)})`:
                            easyai_config.openai_token = obj.token
                            easyai_config.openai_model = obj.model
                            // Clear other configs
                            delete easyai_config.deepinfra_token
                            delete easyai_config.deepinfra_model
                            delete easyai_config.server_url
                            delete easyai_config.server_port
                            delete easyai_config.server_token
                            delete easyai_config.llama
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        case 'Change model':
                            let newModel = await MenuCLI.ask('Select the model', {options : [
                                'gpt-3.5-turbo',
                                'gpt-4',
                                'gpt-4-turbo-preview',
                                'gpt-3.5-turbo-instruct'
                            ]})
                            obj.model = newModel
                            ConfigManager.setKey('openai', obj)
                            easyai_config.openai_token = obj.token
                            easyai_config.openai_model = obj.model
                            // Clear other configs
                            delete easyai_config.deepinfra_token
                            delete easyai_config.deepinfra_model
                            delete easyai_config.server_url
                            delete easyai_config.server_port
                            delete easyai_config.server_token
                            delete easyai_config.llama
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        case 'Edit token':
                            let newToken = await MenuCLI.ask('OpenAI Token : ')
                            obj.token = newToken
                            ConfigManager.setKey('openai', obj)
                            easyai_config.openai_token = obj.token
                            easyai_config.openai_model = obj.model
                            // Clear other configs
                            delete easyai_config.deepinfra_token
                            delete easyai_config.deepinfra_model
                            delete easyai_config.server_url
                            delete easyai_config.server_port
                            delete easyai_config.server_token
                            delete easyai_config.llama
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        case 'Clear configuration':
                            ConfigManager.deleteKey('openai')
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        default:
                            MenuCLI.displayMenu(CustomServer)
                            break
                    }
                } else {
                    let final_object = {}
                    final_object.token = await MenuCLI.ask('OpenAI Token : ')
                    final_object.model = await MenuCLI.ask('Select the model',{options : [
                        'gpt-3.5-turbo',
                        'gpt-4',
                        'gpt-4-turbo-preview',
                        'gpt-3.5-turbo-instruct'
                    ]})
                    if(await MenuCLI.ask('Save key and model?',{options : ['yes','no']}) == 'yes'){
                        ConfigManager.setKey('openai',final_object)
                    }
                    easyai_config.openai_token = final_object.token
                    easyai_config.openai_model = final_object.model
                    // Clear other configs
                    delete easyai_config.deepinfra_token
                    delete easyai_config.deepinfra_model
                    delete easyai_config.server_url
                    delete easyai_config.server_port
                    delete easyai_config.server_token
                    delete easyai_config.llama
                    MenuCLI.displayMenu(CustomServer)
                }
            } else {
                // Toggle OFF - remove token and model
                delete easyai_config.openai_token
                delete easyai_config.openai_model
                MenuCLI.displayMenu(CustomServer)
            }
        }
    },
    {
        name : `${ConfigManager.getKey('deepinfra') ? `🌐 ${ColorText.green('DeepInfra')}` : `🌐 ${ColorText.red('DeepInfra')}`} | ${easyai_config.deepinfra_token ? ColorText.green('ON') : ColorText.red('OFF')}`,
        action : async () => {
            // Check if currently enabled (has token)
            if(!easyai_config.deepinfra_token) {
                // Turning ON - need to configure
                if(ConfigManager.getKey('deepinfra')){
                    let obj = ConfigManager.getKey('deepinfra')
                    
                    let response = await MenuCLI.ask('DeepInfra Configuration', {options : [
                        `Use with current model (${ColorText.green(obj.model)})`,
                        'Change model',
                        'Edit token',
                        'Clear configuration',
                        'Cancel'
                    ]})
                    
                    switch(response) {
                        case `Use with current model (${ColorText.green(obj.model)})`:
                            easyai_config.deepinfra_token = obj.token
                            easyai_config.deepinfra_model = obj.model
                            // Clear other configs
                            delete easyai_config.openai_token
                            delete easyai_config.openai_model
                            delete easyai_config.server_url
                            delete easyai_config.server_port
                            delete easyai_config.server_token
                            delete easyai_config.llama
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        case 'Change model':
                            let newModel = await MenuCLI.ask('Select the model', {options : DeepInfra.Models})
                            obj.model = newModel
                            ConfigManager.setKey('deepinfra', obj)
                            easyai_config.deepinfra_token = obj.token
                            easyai_config.deepinfra_model = obj.model
                            // Clear other configs
                            delete easyai_config.openai_token
                            delete easyai_config.openai_model
                            delete easyai_config.server_url
                            delete easyai_config.server_port
                            delete easyai_config.server_token
                            delete easyai_config.llama
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        case 'Edit token':
                            let newToken = await MenuCLI.ask('DeepInfra Token : ')
                            obj.token = newToken
                            ConfigManager.setKey('deepinfra', obj)
                            easyai_config.deepinfra_token = obj.token
                            easyai_config.deepinfra_model = obj.model
                            // Clear other configs
                            delete easyai_config.openai_token
                            delete easyai_config.openai_model
                            delete easyai_config.server_url
                            delete easyai_config.server_port
                            delete easyai_config.server_token
                            delete easyai_config.llama
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        case 'Clear configuration':
                            ConfigManager.deleteKey('deepinfra')
                            MenuCLI.displayMenu(CustomServer)
                            break
                            
                        default:
                            MenuCLI.displayMenu(CustomServer)
                            break
                    }
                } else {
                    let final_object = {}
                    final_object.token = await MenuCLI.ask('DeepInfra Token : ')
                    final_object.model = await MenuCLI.ask('Select the model',{options : DeepInfra.Models})
                    if(await MenuCLI.ask('Save key and model?',{options : ['yes','no']}) == 'yes'){
                        ConfigManager.setKey('deepinfra',final_object)
                    }
                    easyai_config.deepinfra_token = final_object.token
                    easyai_config.deepinfra_model = final_object.model
                    // Clear other configs
                    delete easyai_config.openai_token
                    delete easyai_config.openai_model
                    delete easyai_config.server_url
                    delete easyai_config.server_port
                    delete easyai_config.server_token
                    delete easyai_config.llama
                    MenuCLI.displayMenu(CustomServer)
                }
            } else {
                // Toggle OFF - remove token and model
                delete easyai_config.deepinfra_token
                delete easyai_config.deepinfra_model
                MenuCLI.displayMenu(CustomServer)
            }
        }
    },
    {
        name : `Threads | ${easyai_config.llama ? (easyai_config.llama.threads ? ColorText.magenta(easyai_config.llama.threads) : ColorText.green('MAX')) : ColorText.green('MAX')}`,
        action : async () => {
            let newthreads = await MenuCLI.ask('Qntd. Threads : ')
            if(easyai_config.llama){
                easyai_config.llama.threads = Number(newthreads)
            } else {
                easyai_config.llama = {}
                easyai_config.llama.threads = Number(newthreads)
            }
            MenuCLI.displayMenu(CustomServer) 
        }
    },
    {
        name : `GPU | ${easyai_config.llama ? (easyai_config.llama.cuda ? ColorText.green('CUDA') : (easyai_config.llama.vulkan ? `${ColorText.orange('Vulkan')} (cmake only)` : ColorText.red('OFF')) ) : ColorText.red('OFF')}`,
        action : () => {
            if(easyai_config.llama){
                if(easyai_config.llama.cuda){
                    delete easyai_config.llama.cuda
                    easyai_config.llama.vulkan = true
                } else if(easyai_config.llama.vulkan){
                    delete easyai_config.llama.vulkan
                } else {
                    easyai_config.llama.cuda = true
                }
            } else {
                easyai_config.llama = {}
                easyai_config.llama.cuda = true
            }
            MenuCLI.displayMenu(CustomServer)
        }
    },
    {
        name : `Select Model ${easyai_config.llama ? (easyai_config.llama.llama_model ?  `| ${easyai_config.llama.llama_model}` : '') : ''}`,
        action : async  () => {
            MenuCLI.displayMenu(ModelsMenu,{props : {options : await models_options()}})
        }
    },
    {
        name: `📑 ${ColorText.orange('Save')}`,
        action: async () => {
          let name = await MenuCLI.ask('Save name? : ');
          let save_result = await ServerSaves.Save(name, { 
            pm2: withPM2, 
            webgpt_port: webgpt_port, 
            token: easyai_token,  // This saves the server access token
            port: easyai_port, 
            EasyAI_Config: easyai_config 
          });
          if (save_result === false) {
            let result = await MenuCLI.displayMenuFromOptions(`⛔ Save already exists\nOverwrite?`, ['Overwrite', 'Cancel']);
            if (result == 'Overwrite') {
              await ServerSaves.ForceSave(name, { 
                pm2: withPM2, 
                token: easyai_token,  // This saves the server access token
                webgpt_port: webgpt_port, 
                port: easyai_port, 
                EasyAI_Config: easyai_config 
              });
              MenuCLI.displayMenu(CustomServer, { props: { save_message: '✔️ Settings saved successfully!' } });
            } else {
              MenuCLI.displayMenu(CustomServer);
            }
          } else {
            MenuCLI.displayMenu(CustomServer, { props: { save_message: '✔️ Settings saved successfully!' } });
          }
        }
    },
    {
        name : '← Back',
        action : () => {
            MenuCLI.displayMenu(ServerMenu)
        }
    }
]
})


let server_menu_options = async () => {

    let opt_array = [
    {
    name : ColorText.yellow('⚡ Just Start'),
    action : async () => {
        easyai_config = {}
        if(ConfigManager.getKey('start-cuda')){
            easyai_config.llama = {}
            easyai_config.llama.cuda = true
        }
        if(ConfigManager.getKey('start-pm2')){
           withPM2 = true
        }

        if(withPM2){
            await EasyAI.Server.PM2({token : easyai_token,port : easyai_port,EasyAI_Config : easyai_config})
            MenuCLI.displayMenu(ServerMenu,{alert_emoji : '✔️',alert : 'PM2 Server iniciado com sucesso !'})
         } else {
            let server = new EasyAI.Server({EasyAI_Config : easyai_config})
            server.start()
        }
        
    }
    },
    {
    name : '✏️  Custom',
    action : () => {
        easyai_config = {}
        if(ConfigManager.getKey('start-cuda')){
            easyai_config.llama = {}
            easyai_config.llama.cuda = true
        }
        if(ConfigManager.getKey('start-pm2')){
            withPM2 = true
         } else {
            withPM2 = false
         }
        easyai_port = 4000
        easyai_token = undefined
        MenuCLI.displayMenu(CustomServer)
        }
    },
    {
        name : '📁 Saves',
        action : async () => {
            MenuCLI.displayMenu(SavesMenu,{props : {options : await save_options()}})
            }
        }
    
     ]

     if(await PM2.Process('pm2_easyai_server').catch(e =>{})){
        opt_array.push({
            name : ColorText.red('❌ Close PM2 Server'),
            action : async () => {
                await PM2.Delete('pm2_easyai_server')
                MenuCLI.displayMenu(ServerMenu)
                }
            })
     }

     opt_array.push({
        name : '← Back',
        action : () => {
            MenuCLI.displayMenu(StartMenu)
            }
        })
    
    return opt_array
    }

const ServerMenu = async () => ({
    title : `• EasyAI Server`,
options : await server_menu_options()

})

const SavesMenu = (props) => ({
    title : `• Saves •`,
options : props.options
})

const ModelsMenu = (props) => ({
    title : `• Modelos •`,
options : props.options
})

export default ServerMenu


/*
{
        name : `Build | ${easyai_config.llama ? (easyai_config.llama.cmake ? ColorText.yellow('cmake') : ColorText.cyan('make')) : ColorText.cyan('make')}`,
        action : () => {
            if(easyai_config.llama){
                if(easyai_config.llama.cmake){
                    delete easyai_config.llama.cmake
                } else {
                    easyai_config.llama.cmake = true
                }
            } else {
                easyai_config.llama = {}
                easyai_config.llama.cmake = true
            }
                    MenuCLI.displayMenu(CustomServer)
                }
    },

    */