import { promises as fsPromises, createWriteStream } from 'fs';
import path , { join } from 'path';
import https from 'https';
import {exec, spawn} from 'child_process'
import findDirectory from '../useful/findDirectory.js'
import Git from '../useful/Git.js'
import http from 'http'
import System from '../useful/System.js';
import CheckFile from '../useful/CheckFile.js';
import LlamacppRepo from '../MenuCLI/Requirements/LlamacppRepo.js'
import ConfigManager from '../ConfigManager.js';
import BashrcRefresh from '../useful/BashrcRefresh.js';
import FixBuildInfo from './FixBuildInfo.js';
import FreePort from '../useful/FreePort.js'

const Sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function healthCheckRequest(port = 8080) {
    const url = new URL(`http://127.0.0.1:${port}/health`);

    const options = {
        method: 'GET',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    
                    if (res.statusCode === 200) {
                        resolve({
                            status: 'ready',
                            statusCode: res.statusCode,
                            data: response
                        });
                    } else if (res.statusCode === 503) {
                        resolve({
                            status: 'loading',
                            statusCode: res.statusCode,
                            data: response
                        });
                    } else {
                        reject(new Error(`Unexpected status code ${res.statusCode}: ${data}`));
                    }
                } catch (error) {
                    reject(new Error("Failed to parse response as JSON: " + data));
                }
            });
        });

        req.on('error', (error) => {
            console.error("Error in healthCheckRequest()", error);
            reject(error);
        });

        req.end();
    });
}

async function CompletionPostRequest(bodyObject,config,streamCallback,port = 8080) {
    const url = new URL(`http://127.0.0.1:${port}/completion`);

    const options = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
            'Content-Type': 'application/json;charset=UTF-8'
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            let final_text = ''

            res.on('data', (chunk) => {
                data += chunk;

                if (bodyObject.stream) {
                    try {
                        let stream = chunk.toString()
                        if (stream.startsWith("data: ")) {
                            stream = stream.substring("data: ".length);
                        }
                        stream = JSON.parse(stream);
                        if(stream.generation_settings){
                            delete stream.streamLog;
                            stream.content = final_text
                            resolve(stream)
                        } else {
                            //Aqui inserir a maneira de cuspir esses stream_event 
                            //para forada função sem perder o resolve final com o objeto completo
                            final_text += stream.content
                            streamCallback && streamCallback({stream})
                        }
                        //console.log("Received streamed message:", stream);
                    } catch (error) {
                        console.error("Failed to parse a streamed chunk as JSON:", chunk.toString());
                    }
                }
            });

            res.on('end', () => {
                if (!bodyObject.stream) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (error) {
                            reject(new Error("Failed to parse response as JSON: " + data));
                        }
                    } else {
                        reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
                    }
                } 
            });
        });

        req.on('error', (error) => {
            console.error("Erro no CompletationPostRequest()", error);
            reject(error);
        });

        req.write(JSON.stringify(bodyObject));
        req.end();
    });
}

class LlamaCPP {
    constructor(config = {uniqueid : undefined,jbuild : false,vulkan : false,cmake : false,server_port : undefined,git_hash : undefined ,modelpath : '',cuda : false,gpu_layers : undefined,threads : undefined,lora : undefined,lorabase : undefined,context : undefined,slots : undefined,mlock : undefined,mmap : undefined}) {
        if (config.modelpath) {
            this.ModelPath = path.join(process.cwd(), config.modelpath);
        } else {
            this.ModelPath = '';
        }
        this.UniqueID = config.uniqueid || undefined
        this.GitHash = config.git_hash || undefined
        this.Cuda = config.cuda || false
        this.Context = (config.context) ? ((typeof config.context == 'number') ? config.context : 2048) : 2048
        this.Threads = config.threads || undefined
        this.Slots = config.slots || undefined
        this.Mlock = config.mlock || false
        this.Mmap = config.mmap || false
        this.LoraPath = config.lora || undefined
        this.LoraBase = config.lorabase || false
        this.ModelLoaded = false;
        this.llamaCPP_installed = false
        this.ServerPort = config.server_port || 8080
        this.ServerOn = false
        this.CMake_Build = config.cmake || false
        this.Vulkan = config.vulkan || false    
        this.GPU_Layers = config.gpu_layers || (this.Cuda || this.Vulkan) ? 999 : undefined
        this.JBuild = ConfigManager.getKey('jbuild') || false
        this.InUse = false
        this.LastAction = Date.now()
        this.ProcessPID = undefined

        

        this.Start()        

    }   



async Start(){
    await this.initializeModelPath();
    await this.initializeLlamaCPPRepo()
    await this.LlamaServer()
}



async LlamaServer() {
    let cpp_path = await findDirectory(process.cwd(), 'llama.cpp');
    if (!cpp_path) {
        console.error('llama.cpp directory not found.');
        return;
    }

    let system = System()
    if(system == 'linux'){
        await BashrcRefresh()
        FixBuildInfo()
    }

    console.log('Executing command lines...');
    try {

        if(this.GitHash){
            let actual_hash = await Git.ActualHash(cpp_path)
            if(actual_hash != this.GitHash){
               await Git.Checkout(cpp_path,this.GitHash)
            }
        }
        
        let cpath
        if(ConfigManager.getKey('old-llama-server')){
            cpath = 'server'
            } else {
            cpath = 'llama-server'
            }
        let has_make_build = await CheckFile(`./llama.cpp/${cpath}`)

        let has_cmake_build = await CheckFile(`./llama.cpp/build/bin/${cpath}`)

        if(!has_make_build && !has_cmake_build){
        if(this.CMake_Build){
            if(cpath == 'llama-server'){
                await this.runCmake(cpp_path)
            } else {
                //await fsPromises.rm('./build')
                //ConfigManager.setKey('commit-swap',await Git.ActualHash(cpp_path))
                //Git.Checkout()
                this.runMake(cpp_path)
            }
            
        } else {
            if(cpath == 'server'){
            await this.runMake(cpp_path);
            } else {
            await this.runCmake(cpp_path) 
            }
        }   
       
        } 
        this.ServerPort = await FreePort(this.ServerPort)
        await this.executeMain(cpp_path);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

runMake(cpp_path) {
    return new Promise((resolve, reject) => {
        let args = []
        if(this.JBuild){
            let threads = ''
            if(ConfigManager.getKey('jbuild-threads')){threads = ` ${ConfigManager.getKey('jbuild-threads')}`}
            args.push(`-j${threads}`)
        }
        if(this.Cuda){args.push('LLAMA_CUBLAS=1')}
        let make = spawn('make', args, { cwd: cpp_path, stdio: 'inherit' });

        make.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`make process exited with code ${code}`));
            } else {
                resolve();
            }
        });

        make.on('error', (err) => {
            reject(new Error('Error executing make:', err));
        });
    });
}

runCmake(cpp_path) {
    return new Promise((resolve, reject) => {
      let args1 = ['-B', 'build'];
      if(this.Vulkan){args1.push('-DLLAMA_VULKAN=1')}
      if(this.Cuda){args1.push('-DGGML_CUDA=ON')}
      args1.push('-DLLAMA_CURL=OFF') 
      let cmake1 = spawn('cmake', args1, { cwd: cpp_path, stdio: 'inherit' });
  
      cmake1.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`cmake process exited with code ${code}`));
        } else {
          let args2 = ['--build', 'build', '--config', 'Release'];
          if(this.JBuild){
            let threads = ''
            if(ConfigManager.getKey('jbuild-threads')){threads = ` ${ConfigManager.getKey('jbuild-threads')}`}
            args2.push(`-j${threads}`)
            }
          let cmake2 = spawn('cmake', args2, { cwd: cpp_path, stdio: 'inherit' });
  
          cmake2.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`cmake build process exited with code ${code}`));
            } else {
              resolve();
            }
          });
  
          cmake2.on('error', (err) => {
            reject(new Error('Error executing cmake build:', err));
          });
        }
      });
  
      cmake1.on('error', (err) => {
        reject(new Error('Error executing cmake:', err));
      });
    });
  }

executeMain(cpp_path) {
    return new Promise(async (resolve, reject) => {
        let mainArgs = ['-m', this.ModelPath, '-c', this.Context,'--port',this.ServerPort,'--no-webui'];
        if(this.Threads && typeof this.Threads == 'number'){
            mainArgs.push('-t')
            mainArgs.push(this.Threads)
        }
        if(this.GPU_Layers && typeof this.GPU_Layers == 'number'){
            mainArgs.push('-ngl')
            mainArgs.push(this.GPU_Layers)
        }
        if(this.Mlock){
            mainArgs.push('--mlock')
        }
        if(this.Mmap){
            mainArgs.push('--no-mmap')
        }
        if(this.Slots && typeof this.Slots == 'number' && this.Slots > 0){
            mainArgs.push('-np')
            mainArgs.push(this.Slots)
        }
        if(this.LoraPath){
            if(this.LoraBase){
                mainArgs.push('--lora-base')
            } else {
                mainArgs.push('--lora')
            }
            
            mainArgs.push(this.LoraPath)
        }
        let cpath
        if(ConfigManager.getKey('old-llama-server')){
            cpath = 'server'
            } else {
            cpath = 'llama-server'
            }
        let has_make_build = await CheckFile(`./llama.cpp/${cpath}`)

        let has_cmake_build = await CheckFile(`./llama.cpp/build/bin/${cpath}`)
        
        let path

        if(has_cmake_build){
            path = `./build/bin/${cpath}`
        } else if (has_make_build){
            path = `./${cpath}`
        }

        let executeMain = spawn(path, mainArgs, { cwd: cpp_path, stdio: 'inherit' });
        
        this.ProcessPID = executeMain.pid

        executeMain.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`./main process exited with code ${code}`));
            } else {
                resolve();
            }
        });

        executeMain.on('error', (err) => {
            reject(new Error('Error executing ./main:', err));
        });

        setInterval(async () => {
            if(!this.ServerOn){
           let result = await healthCheckRequest(this.ServerPort)
           if(result.status == 'ready'){
            this.ServerOn = true
            resolve()
           }
        }
        },1000)
    });
}

async Generate(prompt = 'Once upon a time',config = {logerror : false, stream : false},tokenCallback) {
    this.LastAction = Date.now()
    if (this.ModelLoaded && this.llamaCPP_installed && this.ServerOn) {
         this.InUse = true

       return await CompletionPostRequest({prompt : prompt,...config},{},(stream) => {tokenCallback && tokenCallback(stream)},this.ServerPort)
       .then(s => {
        this.LastAction = Date.now()
        this.InUse = false
        return s
       })
       .catch(e => {
        this.LastAction = Date.now()
        this.InUse = false
       })
        
    } else {
        if(config.logerror){
            this.LastAction = Date.now()
            console.error('Erro no LlamaCPP.Generate() | Modelo não carregado, llama.cpp não encontrado ou o server não está ON');
        }
        return false;
    }
}

    async initializeLlamaCPPRepo() {
    const llamaCPPDir = path.join(process.cwd(), 'llama.cpp');

    if (!await this.directoryExists(llamaCPPDir)) {
        console.log('Cloning/Extracting the llama.cpp repository...');
        if(ConfigManager.getKey('gh-llama')){
            await LlamacppRepo.cloneRepository()
        } else {
            await LlamacppRepo.Extract() 
        }
    } else {
        this.llamaCPP_installed = true;
        console.log('llama.cpp repository already exists.');
        }
    }

    async cloneRepository() {
    return new Promise((resolve, reject) => {
        exec('git clone https://github.com/ggerganov/llama.cpp.git', { cwd: process.cwd() }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
                }
            });
        });
    }

    async initializeModelPath() {
        const modelsDir = path.join(process.cwd(), './models');
    
        if (!await this.directoryExists(modelsDir)) {
            await fsPromises.mkdir(modelsDir);
        }
    
        
        if (this.ModelPath) {
            if (!this.ModelPath.endsWith('.gguf')) {
                console.error('Provided model path is not in .gguf format.');
            } else {
                try {
                    await fsPromises.access(this.ModelPath);
                    console.log(`Llama Model successfully loaded: ${this.ModelPath}`);
                    this.ModelLoaded = true;
                    return;
                } catch {
                    console.error('Provided model path is not valid.');
                }
            }
        }
    
        const modelFilePath = ConfigManager.getKey('automodel-smaller') ? await this.getSmallestGGUF(modelsDir) : await this.getLargestGGUF(modelsDir);
        if (modelFilePath) {
            this.ModelPath = modelFilePath;
            console.log(`\nLlama Model successfully loaded: ${this.ModelPath}`);
            this.ModelLoaded = true;
        } else {
            const shouldDownload = await this.promptDownloadModel();
            if (shouldDownload) {
                await this.loadSampleModel(modelsDir);
            } else {
                console.log('No Llama Model was loaded.');
            }
        }
    }

    async loadSampleModel(modelsDir) {
        const downloadURL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q3_k_m.gguf';
        const destPath = join(modelsDir, 'qwen2.5-0.5b-instruct-q3_k_m.gguf');
        await this.downloadFile(downloadURL, destPath);
        this.ModelPath = await this.getLargestGGUF(modelsDir);
        console.log(`\nLlama Model successfully downloaded and loaded from: ${this.ModelPath}`);
        this.ModelLoaded = true;
    }

    async directoryExists(path) {
        try {
            const stats = await fsPromises.stat(path);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async getSmallestGGUF(dir) {
        const files = await fsPromises.readdir(dir);
        let smallestFilePath = '';
        let smallestFileSize = Infinity;
      
        for (const file of files) {
          if (file.endsWith('.gguf')) {
            const filePath = join(dir, file);
            const { size } = await fsPromises.stat(filePath);
            if (size < smallestFileSize) {
              smallestFileSize = size;
              smallestFilePath = filePath;
            }
          }
        }
        return smallestFilePath;
      }

    async getLargestGGUF(dir) {
        const files = await fsPromises.readdir(dir);
        let largestFilePath = '';
        let largestFileSize = 0;

        for (const file of files) {
            if (file.endsWith('.gguf')) {
                const filePath = join(dir, file);
                const { size } = await fsPromises.stat(filePath);
                if (size > largestFileSize) {
                    largestFileSize = size;
                    largestFilePath = filePath;
                }
            }
        }
        return largestFilePath;
    }

    promptDownloadModel() {
        return new Promise((resolve) => {
            process.stdout.write('No Llama Model is encountered in models folder. Wanna download a sample Llama Model? (Y/n): ');
            process.stdin.once('data', (data) => {
                const answer = data.toString().trim().toLowerCase();
                resolve(answer === 'y' || answer === '');
            });
        });
    }

    downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = createWriteStream(dest);

            const download = (currentUrl) => {
                https.get(currentUrl, (response) => {
                    if (response.statusCode === 200) {
                        const totalBytes = Number(response.headers['content-length']);
                        let downloadedBytes = 0;

                        response.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                            this.printProgress(downloadedBytes, totalBytes);
                            file.write(chunk);
                        });

                        response.on('end', () => {
                            file.end(() => resolve());
                        });
                    } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        const newUrl = new URL(response.headers.location, currentUrl).toString();
                        download(newUrl);
                    } else {
                        reject(new Error(`Failed to download file. HTTP Status: ${response.statusCode}`));
                    }
                }).on('error', (err) => {
                    fsPromises.unlink(dest).catch(() => {});
                    reject(err);
                });
            };

            download(url);
        });
    }

    printProgress(downloaded, total) {
        const percentage = (downloaded / total) * 100;
        const progressBarLength = 50;
        const numberOfBlocks = Math.floor((percentage / 100) * progressBarLength);
        const progressBlocks = '#'.repeat(numberOfBlocks);
        const emptyBlocks = ' '.repeat(progressBarLength - numberOfBlocks);
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(`Downloading Llama Model: [${progressBlocks}${emptyBlocks}] ${percentage.toFixed(2)}%`);
    }
}

export default LlamaCPP;