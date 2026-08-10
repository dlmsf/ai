import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'saves.json');

class ServerSaves {
  static async ensureFileExists() {
    try {
      await fs.promises.access(filePath);
    } catch {
      await fs.promises.writeFile(filePath, JSON.stringify([]));
    }
  }

  static async Save(name, { webgpt_port, pm2, token, port, EasyAI_Config = {}, KillAllPM2 = false }) {
    await this.ensureFileExists();
    const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const existingIndex = data.findIndex((save) => save.Name === name);

    if (existingIndex !== -1) {
      return false
    }

    data.push({ Name: name, Token: token, Webgpt_Port: webgpt_port, PM2: pm2, Port: port, EasyAI_Config, KillAllPM2 });
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    return true
  }

  static async ForceSave(name, { webgpt_port, pm2, token, port, EasyAI_Config = {}, KillAllPM2 = false }) {
    await this.ensureFileExists();
    let data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const existingIndex = data.findIndex((save) => save.Name === name);

    if (existingIndex !== -1) {
      data[existingIndex] = { Name: name, Token: token, Webgpt_Port: webgpt_port, PM2: pm2, Port: port, EasyAI_Config, KillAllPM2 };
    } else {
      data.push({ Name: name, Token: token, Webgpt_Port: webgpt_port, PM2: pm2, Port: port, EasyAI_Config, KillAllPM2 });
    }

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  }

  
  static async Load(name) {
    await this.ensureFileExists();
    const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const save = data.find((save) => save.Name === name);

    if (!save) {
      throw new Error(`Save with name ${name} does not exist.`);
    }

    return save;
  }

  static async Rename(oldName, newName) {
    await this.ensureFileExists();
    let data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const index = data.findIndex((save) => save.Name === oldName);
  
    if (index === -1) {
      throw new Error(`Save with name ${oldName} does not exist.`);
    }
  
    if (data.find((save) => save.Name === newName)) {
      throw new Error(`Save with name ${newName} already exists.`);
    }
  
    data[index].Name = newName;
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  static async List() {
    await this.ensureFileExists();
    const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    return data.map((save) => save.Name);
  }

  static async Delete(name) {
    await this.ensureFileExists();
    let data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const index = data.findIndex((save) => save.Name === name);

    if (index === -1) {
      throw new Error(`Save with name ${name} does not exist.`);
    }

    data = data.filter((save) => save.Name !== name);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }
}

export default ServerSaves