//LModel.js
import { readFileSync, writeFileSync, statSync, readFile, writeFile } from 'fs';
import { deflateSync, inflateSync } from 'zlib';

export default class LModel {
  static data = null;
  static filePath = null;
  static useCompression = true;
  static compressionLevel = 9; // 1-9, 9 = maximum compression

  // Serialize data to compressed binary format
  static serialize(data) {
    // Step 1: Convert to binary format
    const buffers = [];
    this._encode(data, buffers);
    const binary = Buffer.concat(buffers);
    
    // Step 2: Apply compression
    if (this.useCompression) {
      return deflateSync(binary, { level: this.compressionLevel });
    }
    return binary;
  }

  // Deserialize compressed binary format back to data
  static deserialize(buffer) {
    try {
      // Step 1: Try to decompress
      let data;
      try {
        data = inflateSync(buffer);
      } catch {
        // If decompression fails, use raw binary
        data = buffer;
      }
      
      // Step 2: Decode binary
      let offset = 0;
      return this._decode(data, offset).value;
    } catch (error) {
      throw new Error(`Failed to deserialize: ${error.message}`);
    }
  }

  // Internal encoding methods
  static _encode(value, buffers) {
    if (value === null) {
      buffers.push(Buffer.from([0xC0]));
    } else if (value === undefined) {
      buffers.push(Buffer.from([0xC1]));
    } else if (typeof value === 'boolean') {
      buffers.push(Buffer.from([value ? 0xC3 : 0xC2]));
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value >= 0 && value <= 127) {
          buffers.push(Buffer.from([value]));
        } else if (value >= -32 && value < 0) {
          buffers.push(Buffer.from([0x100 + value]));
        } else if (value >= -128 && value <= 127) {
          const buf = Buffer.allocUnsafe(2);
          buf.writeInt8(0xD0, 0);
          buf.writeInt8(value, 1);
          buffers.push(buf);
        } else if (value >= -32768 && value <= 32767) {
          const buf = Buffer.allocUnsafe(3);
          buf.writeUInt8(0xD1, 0);
          buf.writeInt16BE(value, 1);
          buffers.push(buf);
        } else if (value >= -2147483648 && value <= 2147483647) {
          const buf = Buffer.allocUnsafe(5);
          buf.writeUInt8(0xD2, 0);
          buf.writeInt32BE(value, 1);
          buffers.push(buf);
        } else {
          const buf = Buffer.allocUnsafe(9);
          buf.writeUInt8(0xD3, 0);
          buf.writeBigInt64BE(BigInt(value), 1);
          buffers.push(buf);
        }
      } else {
        const buf = Buffer.allocUnsafe(9);
        buf.writeUInt8(0xCB, 0);
        buf.writeDoubleBE(value, 1);
        buffers.push(buf);
      }
    } else if (typeof value === 'string') {
      const strBuf = Buffer.from(value, 'utf8');
      const len = strBuf.length;
      
      if (len <= 31) {
        buffers.push(Buffer.from([0xA0 + len]));
      } else if (len <= 255) {
        const buf = Buffer.allocUnsafe(2);
        buf.writeUInt8(0xD9, 0);
        buf.writeUInt8(len, 1);
        buffers.push(buf);
      } else if (len <= 65535) {
        const buf = Buffer.allocUnsafe(3);
        buf.writeUInt8(0xDA, 0);
        buf.writeUInt16BE(len, 1);
        buffers.push(buf);
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf.writeUInt8(0xDB, 0);
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      buffers.push(strBuf);
    } else if (Array.isArray(value)) {
      const len = value.length;
      if (len <= 15) {
        buffers.push(Buffer.from([0x90 + len]));
      } else if (len <= 65535) {
        const buf = Buffer.allocUnsafe(3);
        buf.writeUInt8(0xDC, 0);
        buf.writeUInt16BE(len, 1);
        buffers.push(buf);
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf.writeUInt8(0xDD, 0);
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      for (const item of value) {
        this._encode(item, buffers);
      }
    } else if (typeof value === 'object') {
      const keys = Object.keys(value);
      const len = keys.length;
      if (len <= 15) {
        buffers.push(Buffer.from([0x80 + len]));
      } else if (len <= 65535) {
        const buf = Buffer.allocUnsafe(3);
        buf.writeUInt8(0xDE, 0);
        buf.writeUInt16BE(len, 1);
        buffers.push(buf);
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf.writeUInt8(0xDF, 0);
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      for (const key of keys) {
        this._encode(key, buffers);
        this._encode(value[key], buffers);
      }
    } else if (value instanceof Date) {
      const buf = Buffer.allocUnsafe(9);
      buf.writeUInt8(0xD6, 0);
      buf.writeDoubleBE(value.getTime() / 1000, 1);
      buffers.push(buf);
    }
  }

  // Internal decoding method
  static _decode(buffer, offset) {
    const type = buffer.readUInt8(offset);
    offset += 1;

    if (type <= 0x7F) {
      return { value: type, offset };
    }
    if (type >= 0xE0) {
      return { value: type - 0x100, offset };
    }
    if (type >= 0x80 && type <= 0x8F) {
      const len = type - 0x80;
      const obj = {};
      for (let i = 0; i < len; i++) {
        const keyResult = this._decode(buffer, offset);
        offset = keyResult.offset;
        const valueResult = this._decode(buffer, offset);
        offset = valueResult.offset;
        obj[keyResult.value] = valueResult.value;
      }
      return { value: obj, offset };
    }
    if (type >= 0x90 && type <= 0x9F) {
      const len = type - 0x90;
      const arr = [];
      for (let i = 0; i < len; i++) {
        const result = this._decode(buffer, offset);
        offset = result.offset;
        arr.push(result.value);
      }
      return { value: arr, offset };
    }
    if (type >= 0xA0 && type <= 0xBF) {
      const len = type - 0xA0;
      const value = buffer.toString('utf8', offset, offset + len);
      return { value, offset: offset + len };
    }

    switch (type) {
      case 0xC0: return { value: null, offset };
      case 0xC1: return { value: undefined, offset };
      case 0xC2: return { value: false, offset };
      case 0xC3: return { value: true, offset };
      case 0xCB: {
        const value = buffer.readDoubleBE(offset);
        return { value, offset: offset + 8 };
      }
      case 0xD0: {
        const value = buffer.readInt8(offset);
        return { value, offset: offset + 1 };
      }
      case 0xD1: {
        const value = buffer.readInt16BE(offset);
        return { value, offset: offset + 2 };
      }
      case 0xD2: {
        const value = buffer.readInt32BE(offset);
        return { value, offset: offset + 4 };
      }
      case 0xD3: {
        const value = Number(buffer.readBigInt64BE(offset));
        return { value, offset: offset + 8 };
      }
      case 0xD6: {
        const timestamp = buffer.readDoubleBE(offset);
        return { value: new Date(timestamp * 1000), offset: offset + 8 };
      }
      case 0xD9: {
        const len = buffer.readUInt8(offset);
        offset += 1;
        const value = buffer.toString('utf8', offset, offset + len);
        return { value, offset: offset + len };
      }
      case 0xDA: {
        const len = buffer.readUInt16BE(offset);
        offset += 2;
        const value = buffer.toString('utf8', offset, offset + len);
        return { value, offset: offset + len };
      }
      case 0xDB: {
        const len = buffer.readUInt32BE(offset);
        offset += 4;
        const value = buffer.toString('utf8', offset, offset + len);
        return { value, offset: offset + len };
      }
      case 0xDC: {
        const len = buffer.readUInt16BE(offset);
        offset += 2;
        const arr = [];
        for (let i = 0; i < len; i++) {
          const result = this._decode(buffer, offset);
          offset = result.offset;
          arr.push(result.value);
        }
        return { value: arr, offset };
      }
      case 0xDD: {
        const len = buffer.readUInt32BE(offset);
        offset += 4;
        const arr = [];
        for (let i = 0; i < len; i++) {
          const result = this._decode(buffer, offset);
          offset = result.offset;
          arr.push(result.value);
        }
        return { value: arr, offset };
      }
      case 0xDE: {
        const len = buffer.readUInt16BE(offset);
        offset += 2;
        const obj = {};
        for (let i = 0; i < len; i++) {
          const keyResult = this._decode(buffer, offset);
          offset = keyResult.offset;
          const valueResult = this._decode(buffer, offset);
          offset = valueResult.offset;
          obj[keyResult.value] = valueResult.value;
        }
        return { value: obj, offset };
      }
      case 0xDF: {
        const len = buffer.readUInt32BE(offset);
        offset += 4;
        const obj = {};
        for (let i = 0; i < len; i++) {
          const keyResult = this._decode(buffer, offset);
          offset = keyResult.offset;
          const valueResult = this._decode(buffer, offset);
          offset = valueResult.offset;
          obj[keyResult.value] = valueResult.value;
        }
        return { value: obj, offset };
      }
      default:
        throw new Error(`Unknown type: 0x${type.toString(16)} at offset ${offset}`);
    }
  }

  // Load data from file (async)
  static async load(filePath) {
    try {
      const buffer = await readFile(filePath);
      this.data = LModel.deserialize(buffer);
      this.filePath = filePath;
      return this.data;
    } catch (error) {
      this.data = {};
      this.filePath = filePath;
      return this.data;
    }
  }

  // Load data synchronously
  static loadSync(filePath) {
    try {
      const buffer = readFileSync(filePath);
      this.data = LModel.deserialize(buffer);
      this.filePath = filePath;
      return this.data;
    } catch (error) {
      this.data = {};
      this.filePath = filePath;
      return this.data;
    }
  }

  // Save data to file (async)
  static async save(filePath = null) {
    const targetPath = filePath || this.filePath;
    if (!targetPath) throw new Error('No file path specified');
    
    const buffer = LModel.serialize(this.data || {});
    await writeFile(targetPath, buffer);
    this.filePath = targetPath;
  }

  // Save data synchronously
  static saveSync(filePath = null) {
    const targetPath = filePath || this.filePath;
    if (!targetPath) throw new Error('No file path specified');
    
    const buffer = LModel.serialize(this.data || {});
    writeFileSync(targetPath, buffer);
    this.filePath = targetPath;
  }

  // Get the entire data object
  static getData() {
    return this.data || {};
  }

  // Set entire data object
  static setData(data) {
    this.data = data;
  }

  // CRUD operations
  static get(key) {
    return this.data?.[key];
  }

  static set(key, value) {
    if (!this.data) this.data = {};
    this.data[key] = value;
  }

  static delete(key) {
    if (this.data) delete this.data[key];
  }

  static has(key) {
    return this.data ? key in this.data : false;
  }

  static keys() {
    return this.data ? Object.keys(this.data) : [];
  }

  static values() {
    return this.data ? Object.values(this.data) : [];
  }

  static entries() {
    return this.data ? Object.entries(this.data) : [];
  }

  static forEach(callback) {
    if (!this.data) return;
    for (const [key, value] of Object.entries(this.data)) {
      callback(value, key, this.data);
    }
  }

  static map(callback) {
    if (!this.data) return [];
    const result = [];
    for (const [key, value] of Object.entries(this.data)) {
      result.push(callback(value, key));
    }
    return result;
  }

  static filter(callback) {
    if (!this.data) return {};
    const result = {};
    for (const [key, value] of Object.entries(this.data)) {
      if (callback(value, key)) {
        result[key] = value;
      }
    }
    return result;
  }

  static size() {
    return this.data ? Object.keys(this.data).length : 0;
  }

  static clear() {
    this.data = {};
  }

  // Convert from JSON
  static fromJSON(jsonData) {
    this.data = jsonData;
  }

  // Convert to JSON
  static toJSON() {
    return JSON.parse(JSON.stringify(this.data || {}));
  }

  // Enable/disable compression
  static setCompression(enabled, level = 9) {
    this.useCompression = enabled;
    this.compressionLevel = level;
  }

  // Convert JSON file to binary
  static async jsonToBin(jsonPath, binPath) {
    const jsonContent = readFileSync(jsonPath, 'utf8');
    const jsonData = JSON.parse(jsonContent);
    this.data = jsonData;
    const buffer = LModel.serialize(this.data);
    const targetPath = binPath || jsonPath.replace('.json', '.bin');
    await writeFile(targetPath, buffer);
    
    const jsonSize = statSync(jsonPath).size;
    const binSize = statSync(targetPath).size;
    const savings = ((1 - binSize / jsonSize) * 100).toFixed(2);
    console.log(`✅ Converted: ${jsonPath} → ${targetPath}`);
    console.log(`   JSON: ${(jsonSize / 1024).toFixed(2)} KB → Binary: ${(binSize / 1024).toFixed(2)} KB`);
    console.log(`   Saved: ${savings}% (${((jsonSize - binSize) / 1024).toFixed(2)} KB)`);
    return { jsonSize, binSize, savings };
  }

  // Convert JSON file to binary (sync)
  static jsonToBinSync(jsonPath, binPath) {
    const jsonContent = readFileSync(jsonPath, 'utf8');
    const jsonData = JSON.parse(jsonContent);
    this.data = jsonData;
    const buffer = LModel.serialize(this.data);
    const targetPath = binPath || jsonPath.replace('.json', '.bin');
    writeFileSync(targetPath, buffer);
    
    const jsonSize = statSync(jsonPath).size;
    const binSize = statSync(targetPath).size;
    const savings = ((1 - binSize / jsonSize) * 100).toFixed(2);
    console.log(`✅ Converted: ${jsonPath} → ${targetPath}`);
    console.log(`   JSON: ${(jsonSize / 1024).toFixed(2)} KB → Binary: ${(binSize / 1024).toFixed(2)} KB`);
    console.log(`   Saved: ${savings}% (${((jsonSize - binSize) / 1024).toFixed(2)} KB)`);
    return { jsonSize, binSize, savings };
  }

  // Compress existing file further
  static async compress(filePath, level = 9) {
    const buffer = readFileSync(filePath);
    const compressed = deflateSync(buffer, { level });
    const compressedPath = filePath + '.compressed';
    await writeFile(compressedPath, compressed);
    
    const originalSize = buffer.length;
    const compressedSize = compressed.length;
    console.log(`✅ Compressed: ${filePath} → ${compressedPath}`);
    console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB → Compressed: ${(compressedSize / 1024).toFixed(2)} KB`);
    console.log(`   Saved: ${((1 - compressedSize / originalSize) * 100).toFixed(2)}%`);
    return compressedPath;
  }

  // Decompress file
  static async decompress(filePath) {
    const buffer = readFileSync(filePath);
    const decompressed = inflateSync(buffer);
    const decompressedPath = filePath.replace('.compressed', '');
    await writeFile(decompressedPath, decompressed);
    
    console.log(`✅ Decompressed: ${filePath} → ${decompressedPath}`);
    console.log(`   Size: ${(decompressed.length / 1024).toFixed(2)} KB`);
    return decompressedPath;
  }

  // Info command
  static info(filePath) {
    try {
      const stats = statSync(filePath);
      console.log(`\n📁 File: ${filePath}`);
      console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB (${stats.size.toLocaleString()} bytes)`);
      console.log(`   Created: ${stats.birthtime}`);
      console.log(`   Modified: ${stats.mtime}`);
      
      // Check if it's a supported format
      if (filePath.endsWith('.json')) {
        try {
          const content = readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          console.log(`   Format: JSON`);
          console.log(`   Keys/Items: ${Array.isArray(data) ? data.length : Object.keys(data).length}`);
          
          // Show compression potential
          console.log(`\n💡 Tip: Convert to binary for ~${this.estimateCompression(data)}% size reduction`);
          console.log(`   Run: node ${process.argv[1]} convert ${filePath}`);
        } catch {
          console.log(`   Format: Invalid JSON or text file`);
        }
      } else {
        try {
          // Try to load as our binary format
          this.loadSync(filePath);
          const data = this.getData();
          console.log(`   Format: LModel Binary`);
          console.log(`   Keys/Items: ${Array.isArray(data) ? data.length : this.size()}`);
          console.log(`   Compression: Enabled`);
        } catch {
          console.log(`   Format: Unknown binary format`);
        }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  // Estimate compression savings
  static estimateCompression(data) {
    // Sample the data to estimate
    const sample = JSON.stringify(data).slice(0, 10000);
    const sampleBuffer = Buffer.from(sample);
    try {
      const compressed = deflateSync(sampleBuffer);
      const ratio = (1 - compressed.length / sampleBuffer.length) * 100;
      return ratio.toFixed(1);
    } catch {
      return '?';
    }
  }

  // Benchmark load times
  static async benchmark(filePath, iterations = 100) {
    console.log(`\n⚡ Benchmarking: ${filePath}`);
    
    // Test binary format
    const binStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.loadSync(filePath);
    }
    const binTime = (performance.now() - binStart) / iterations;
    
    // Test JSON format (if exists)
    const jsonPath = filePath.replace('.bin', '.json');
    let jsonTime = null;
    try {
      const jsonStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const content = readFileSync(jsonPath, 'utf8');
        JSON.parse(content);
      }
      jsonTime = (performance.now() - jsonStart) / iterations;
    } catch {}
    
    console.log(`   Binary load: ${binTime.toFixed(3)}ms avg`);
    if (jsonTime) {
      console.log(`   JSON load: ${jsonTime.toFixed(3)}ms avg`);
      console.log(`   Speedup: ${((jsonTime / binTime - 1) * 100).toFixed(1)}% faster`);
    }
    
    const stats = statSync(filePath);
    console.log(`   Memory footprint: ${(stats.size / 1024).toFixed(2)} KB on disk`);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🔧 LModel CLI - High Compression Binary Storage

Commands:
  convert <json> [output]    Convert JSON to compressed binary
  info <file>                Show file details and optimization tips
  benchmark <file> [iters]   Test load performance
  compress <file> [level]    Compress existing file further
  help                       Show this help

Examples:
  node Light.mjs convert data.json
  node Light.mjs convert data.json data.bin
  node Light.mjs info data.bin
  node Light.mjs benchmark data.bin 200
  node Light.mjs compress large_file.bin 9
    `);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'convert': {
      const jsonFile = args[1];
      const binFile = args[2];
      
      if (!jsonFile) {
        console.error('❌ Error: Please specify a JSON file to convert');
        process.exit(1);
      }
      
      try {
        // Enable compression for text-heavy data
        LModel.setCompression(true, 9);
        const result = LModel.jsonToBinSync(jsonFile, binFile);
        
        // Show optimization tip for dictionary data
        if (result.savings < 20) {
          console.log(`\n💡 Tip: For text-heavy data like dictionaries, try:`);
          console.log(`   node ${process.argv[1]} compress ${binFile || jsonFile.replace('.json', '.bin')}`);
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }
      break;
    }
    
    case 'info': {
      const file = args[1];
      if (!file) {
        console.error('❌ Error: Please specify a file');
        process.exit(1);
      }
      LModel.info(file);
      break;
    }
    
    case 'benchmark': {
      const file = args[1];
      const iters = parseInt(args[2]) || 100;
      
      if (!file) {
        console.error('❌ Error: Please specify a file to benchmark');
        process.exit(1);
      }
      
      await LModel.benchmark(file, iters);
      break;
    }
    
    case 'compress': {
      const file = args[1];
      const level = parseInt(args[2]) || 9;
      
      if (!file) {
        console.error('❌ Error: Please specify a file to compress');
        process.exit(1);
      }
      
      await LModel.compress(file, level);
      break;
    }
    
    case 'help':
    default:
      console.log(`
🔧 LModel CLI - High Compression Binary Storage

Commands:
  convert <json> [output]    Convert JSON to compressed binary
  info <file>                Show file details and optimization tips
  benchmark <file> [iters]   Test load performance
  compress <file> [level]    Compress existing file further
  help                       Show this help

Examples:
  node Light.mjs convert data.json
  node Light.mjs convert data.json data.bin
  node Light.mjs info data.bin
  node Light.mjs benchmark data.bin 200
  node Light.mjs compress large_file.bin 9
      `);
      break;
  }
}