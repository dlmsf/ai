import MenuCLI from "../MenuCLI.js"
import ColorText from '../../useful/ColorText.js'
import ConfigManager from '../../ConfigManager.js'
import ServerSaves from "../ServerSaves.js"
import SettingsMenu from "./SettingsMenu.js"

// Helper function to ask if user wants to apply the same save to other commands
const askApplyToOthers = async (currentCommand, selectedSave) => {
    const otherCommands = ['chat', 'generate', 'webgpt'].filter(cmd => cmd !== currentCommand)
    
    let options = [
        {
            name: ColorText.red('No (default)'),
            action: () => {
                return false
            }
        },
        {
            name: ColorText.green('Yes, apply to all'),
            action: () => {
                otherCommands.forEach(cmd => {
                    ConfigManager.setKey(`default${cmd}save`, selectedSave)
                })
                return true
            }
        }
    ]
    
    // Add individual options for each other command
    otherCommands.forEach(cmd => {
        options.push({
            name: `Apply only to ${cmd}`,
            action: () => {
                ConfigManager.setKey(`default${cmd}save`, selectedSave)
                return true
            }
        })
    })
    
    const result = await MenuCLI.displayMenuFromOptions(
        `Apply "${ColorText.cyan(selectedSave)}" to other commands?`,
        options,
        { clear: false, defaultOption: 0 } // Default to "No" (first option)
    )
    
    // If result is a function, execute it
    if (typeof result === 'function') {
        result()
    }
    // If result is an object with action, execute it
    else if (result && typeof result.action === 'function') {
        result.action()
    }
}

// Helper function to create the save selection menu for any command type
const createSaveSelectionMenu = (commandType, menuTitle, configKey, backMenu) => {
    return {
        name: `💾 Default Save ${ConfigManager.getKey(configKey) ? `| ${ColorText.cyan(ConfigManager.getKey(configKey))}` : '' }`,
        action: async () => {
            const saves = await ServerSaves.List()
            let options = []
            
            saves.forEach(e => {
                options.push(e)
            })
            
            options.push('DeepSeek')
            options.push('DeepInfra')
            options.push('OpenAI')
            options.push(['← Cancel |', '🗑️ Clear'])
            
            let result = await MenuCLI.displayMenuFromOptions(
                `Choose the save ${ConfigManager.getKey(configKey) ? `| ${ColorText.cyan(ConfigManager.getKey(configKey))}` : '' }`,
                options,
                { clear: true }
            )
            
            if (result !== '← Cancel |' && result !== undefined && result !== '🗑️ Clear') {
                ConfigManager.setKey(configKey, result)
                
                // Ask if want to apply to other commands
                await askApplyToOthers(commandType, result)
                
                MenuCLI.displayMenu(menuTitle)
            } else {
                if (result === '🗑️ Clear') {
                    ConfigManager.deleteKey(configKey)
                }
                MenuCLI.displayMenu(menuTitle)
            }
        }
    }
}

const FlashWebGPT = () => ({
    title: `• Settings / Flash Commands / WebGPT Command-line Configuration`,
    options: [
        createSaveSelectionMenu('webgpt', FlashWebGPT, 'defaultwebgptsave', FlashMenu),
        {
            name: '← Back',
            action: () => {
                MenuCLI.displayMenu(FlashMenu)
            }
        }
    ]
})

const FlashGenerate = () => ({
    title: `• Settings / Flash Commands / Generate Command-line Configuration`,
    options: [
        createSaveSelectionMenu('generate', FlashGenerate, 'defaultgeneratesave', FlashMenu),
        {
            name: '← Back',
            action: () => {
                MenuCLI.displayMenu(FlashMenu)
            }
        }
    ]
})

const FlashChat = () => ({
    title: `• Settings / Flash Commands / Chat Command-line Configuration`,
    options: [
        createSaveSelectionMenu('chat', FlashChat, 'defaultchatsave', FlashMenu),
        {
            name: '← Back',
            action: () => {
                MenuCLI.displayMenu(FlashMenu)
            }
        }
    ]
})

const FlashMenu = () => ({
    title: `• Settings / Flash Commands`,
    options: [
        {
            name: 'chat',
            action: () => {
                MenuCLI.displayMenu(FlashChat)
            }
        },
        {
            name: 'generate',
            action: () => {
                MenuCLI.displayMenu(FlashGenerate)
            }
        },
        {
            name: 'webgpt',
            action: () => {
                MenuCLI.displayMenu(FlashWebGPT)
            }
        },
        {
            name: 'do',
            action: () => {
                MenuCLI.displayMenu(SettingsMenu)
            }
        },
        {
            name: '← Back',
            action: () => {
                MenuCLI.displayMenu(SettingsMenu)
            }
        }
    ]
})

export default FlashMenu