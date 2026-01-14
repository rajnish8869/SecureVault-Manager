import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import type { EncryptionPlugin, VaultItem, LockType, IntruderSession, IntruderSettings } from '../types';

// --- CONSTANTS ---
const SALT_KEY = 'vault_salt';
const VERIFIER_REAL = 'vault_verifier_real';
const VERIFIER_DECOY = 'vault_verifier_decoy';
const TYPE_KEY = 'vault_lock_type';
const BIO_ENABLED_KEY = 'vault_bio_enabled';
const INTRUDER_CONFIG_KEY = 'vault_intruder_config';
const VAULT_DIR = 'secure_vault';

// --- CRYPTO UTILS (Real AES-GCM) ---
class CryptoService {
  static async generateSalt(): Promise<string> {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return this.bufferToBase64(array);
  }

  static async deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    
    const salt = this.base64ToBuffer(saltBase64);
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false, // Key not extractable
      ["encrypt", "decrypt"]
    );
  }

  static async hashForVerification(password: string, saltBase64: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(password + saltBase64);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    return this.bufferToBase64(new Uint8Array(hashBuffer));
  }

  static async encrypt(data: Blob, key: CryptoKey): Promise<{ iv: string, content: string }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const arrayBuffer = await data.arrayBuffer();
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      arrayBuffer
    );

    return {
      iv: this.bufferToBase64(iv),
      content: this.bufferToBase64(new Uint8Array(encrypted))
    };
  }

  static async decrypt(encryptedBase64: string, ivBase64: string, key: CryptoKey): Promise<ArrayBuffer> {
    const iv = this.base64ToBuffer(ivBase64);
    const data = this.base64ToBuffer(encryptedBase64);
    
    return await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
  }

  // --- Helpers ---
  static bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return window.btoa(binary);
  }

  static base64ToBuffer(base64: string): Uint8Array {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
  }
}

// --- FILE SYSTEM UTILS (Real Storage) ---
class StorageService {
  static async init() {
    try {
      await Filesystem.mkdir({
        path: VAULT_DIR,
        directory: Directory.Data,
        recursive: true
      });
    } catch (e) {
      // Ignore if exists
    }
    try {
      await Filesystem.mkdir({
        path: `${VAULT_DIR}/pending_intruders`,
        directory: Directory.Data,
        recursive: true
      });
    } catch (e) {
      // Ignore if exists
    }
  }

  static async saveMetadata(mode: 'REAL' | 'DECOY', items: VaultItem[], key: CryptoKey) {
    const json = JSON.stringify(items);
    const blob = new Blob([json], { type: 'application/json' });
    const encrypted = await CryptoService.encrypt(blob, key);
    
    // Store as JSON object with IV and Content
    await Filesystem.writeFile({
      path: `${VAULT_DIR}/meta_${mode.toLowerCase()}.json`,
      data: JSON.stringify(encrypted),
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
  }

  static async loadMetadata(mode: 'REAL' | 'DECOY', key: CryptoKey): Promise<VaultItem[]> {
    try {
      const result = await Filesystem.readFile({
        path: `${VAULT_DIR}/meta_${mode.toLowerCase()}.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      
      const fileData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
      const decryptedBuffer = await CryptoService.decrypt(fileData.content, fileData.iv, key);
      const dec = new TextDecoder();
      return JSON.parse(dec.decode(decryptedBuffer));
    } catch (e) {
      return []; // Return empty if no file or fail
    }
  }

  static async saveFile(id: string, blob: Blob, key: CryptoKey) {
    const encrypted = await CryptoService.encrypt(blob, key);
    
    await Filesystem.writeFile({
      path: `${VAULT_DIR}/${id}.enc`,
      data: JSON.stringify(encrypted),
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
  }

  static async loadFile(id: string, key: CryptoKey): Promise<Blob> {
    const result = await Filesystem.readFile({
      path: `${VAULT_DIR}/${id}.enc`,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });

    const fileData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
    const decryptedBuffer = await CryptoService.decrypt(fileData.content, fileData.iv, key);
    return new Blob([decryptedBuffer]);
  }

  static async deleteFile(id: string) {
    await Filesystem.deleteFile({
      path: `${VAULT_DIR}/${id}.enc`,
      directory: Directory.Data
    });
  }
}

// --- MAIN IMPLEMENTATION ---
class SecureVaultImplementation implements EncryptionPlugin {
  private currentKey: CryptoKey | null = null;
  private currentMode: 'REAL' | 'DECOY' = 'REAL';
  private sessionActive = false;
  
  // Cache for metadata to avoid constant disk reads
  private vaultCache: VaultItem[] = [];

  async isInitialized(): Promise<{ initialized: boolean }> {
    const { value } = await Preferences.get({ key: VERIFIER_REAL });
    return { initialized: !!value };
  }

  async initializeVault(options: { password: string; type: LockType }): Promise<{ success: boolean }> {
    await StorageService.init();
    
    const salt = await CryptoService.generateSalt();
    const verifier = await CryptoService.hashForVerification(options.password, salt);
    
    await Preferences.set({ key: SALT_KEY, value: salt });
    await Preferences.set({ key: VERIFIER_REAL, value: verifier });
    await Preferences.set({ key: TYPE_KEY, value: options.type });
    
    // Create empty real vault
    const key = await CryptoService.deriveKey(options.password, salt);
    await StorageService.saveMetadata('REAL', [], key);
    
    return { success: true };
  }

  async getLockType(): Promise<{ type: LockType }> {
    const { value } = await Preferences.get({ key: TYPE_KEY });
    return { type: (value as LockType) || 'PASSWORD' };
  }

  async unlockVault(password: string): Promise<{ success: boolean; mode: 'REAL' | 'DECOY' }> {
    const saltRes = await Preferences.get({ key: SALT_KEY });
    const realRes = await Preferences.get({ key: VERIFIER_REAL });
    const decoyRes = await Preferences.get({ key: VERIFIER_DECOY });
    
    if (!saltRes.value || !realRes.value) throw new Error("Vault corrupted or not initialized");

    const inputHash = await CryptoService.hashForVerification(password, saltRes.value);

    // Check Real
    if (inputHash === realRes.value) {
      this.currentMode = 'REAL';
    } 
    // Check Decoy
    else if (decoyRes.value && inputHash === decoyRes.value) {
      this.currentMode = 'DECOY';
    } else {
      throw new Error("Invalid Credentials");
    }

    // Credentials OK, Derive Key
    this.currentKey = await CryptoService.deriveKey(password, saltRes.value);
    this.sessionActive = true;
    this.vaultCache = await StorageService.loadMetadata(this.currentMode, this.currentKey);
    
    return { success: true, mode: this.currentMode };
  }

  async importFile(options: { fileBlob: Blob; fileName: string; password: string }): Promise<VaultItem> {
    if (!this.sessionActive || !this.currentKey) throw new Error("Vault Locked");

    const id = crypto.randomUUID();
    const newItem: VaultItem = {
      id: id,
      originalName: options.fileName,
      originalPath: 'encrypted_storage', 
      mimeType: options.fileBlob.type || 'application/octet-stream',
      size: options.fileBlob.size,
      importedAt: Date.now(),
    };

    // Save actual encrypted file
    await StorageService.saveFile(id, options.fileBlob, this.currentKey);

    // Update Cache
    this.vaultCache.unshift(newItem);
    
    // Save Metadata
    await StorageService.saveMetadata(this.currentMode, this.vaultCache, this.currentKey);

    return newItem;
  }

  async getVaultFiles(): Promise<VaultItem[]> {
    if (!this.sessionActive) throw new Error("Vault Locked");
    return this.vaultCache.filter(item => !item.originalName.startsWith('intruder_'));
  }

  async deleteVaultFile(options: { id: string }): Promise<{ success: boolean }> {
    if (!this.sessionActive || !this.currentKey) throw new Error("Vault Locked");

    try {
      await StorageService.deleteFile(options.id);
    } catch(e) {
      console.warn("File likely already deleted");
    }
    
    this.vaultCache = this.vaultCache.filter(i => i.id !== options.id);
    await StorageService.saveMetadata(this.currentMode, this.vaultCache, this.currentKey);
    
    return { success: true };
  }

  async exportFile(options: { id: string; password: string }): Promise<{ success: boolean; exportedPath: string }> {
    if (!this.sessionActive || !this.currentKey) throw new Error("Vault Locked");

    const item = this.vaultCache.find(i => i.id === options.id);
    if (!item) throw new Error("File not found in metadata");

    const blob = await StorageService.loadFile(options.id, this.currentKey);
    
    // For Native: Write to Documents/Download (using standard Filesystem API)
    // For Web: Trigger download
    const filename = `Restored_${item.originalName}`;
    
    // We convert Blob to Base64 to write to public documents
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
    const base64Data = await base64Promise;

    try {
      // Attempt to save to public Documents
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents
      });
      return { success: true, exportedPath: `Documents/${filename}` };
    } catch (e) {
      // Fallback for Web -> Auto Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true, exportedPath: "Downloads Folder" };
    }
  }

  async previewFile(options: { id: string; password: string }): Promise<{ uri: string }> {
    if (!this.sessionActive || !this.currentKey) throw new Error("Vault Locked");
    
    const blob = await StorageService.loadFile(options.id, this.currentKey);
    return { uri: URL.createObjectURL(blob) };
  }

  async updateCredentials(options: { oldPassword: string; newPassword: string; newType: LockType }): Promise<{ success: boolean }> {
    if (this.currentMode === 'DECOY') throw new Error("Cannot change credentials in Decoy mode");
    
    // 1. Re-verify old password (redundant check but good practice)
    const saltRes = await Preferences.get({ key: SALT_KEY });
    if (!saltRes.value) throw new Error("Error loading salt");
    const oldHash = await CryptoService.hashForVerification(options.oldPassword, saltRes.value);
    const storedHash = await Preferences.get({ key: VERIFIER_REAL });
    if (oldHash !== storedHash.value) throw new Error("Old password mismatch");

    // 2. Derive Old Key to decrypt everything
    const oldKey = await CryptoService.deriveKey(options.oldPassword, saltRes.value);
    
    // 3. Load all items with old key
    const allItems = await StorageService.loadMetadata('REAL', oldKey);
    
    // 4. Generate New Salt & Verifier
    const newSalt = await CryptoService.generateSalt();
    const newVerifier = await CryptoService.hashForVerification(options.newPassword, newSalt);
    const newKey = await CryptoService.deriveKey(options.newPassword, newSalt);

    // 5. Re-encrypt Metadata
    await StorageService.saveMetadata('REAL', allItems, newKey);
    
    // 6. Re-encrypt ALL Files (Heavy Operation - simplified here for sequence)
    // Ideally this should be a background task with progress bar.
    for (const item of allItems) {
      try {
        const fileBlob = await StorageService.loadFile(item.id, oldKey);
        await StorageService.saveFile(item.id, fileBlob, newKey);
      } catch (e) {
        console.error("Failed to re-encrypt file", item.id, e);
      }
    }

    // 7. Save new creds
    await Preferences.set({ key: SALT_KEY, value: newSalt });
    await Preferences.set({ key: VERIFIER_REAL, value: newVerifier });
    await Preferences.set({ key: TYPE_KEY, value: options.newType });
    
    // Wipe Decoy because salt changed (making old decoy hash invalid)
    await Preferences.remove({ key: VERIFIER_DECOY });
    await Filesystem.deleteFile({ path: `${VAULT_DIR}/meta_decoy.json`, directory: Directory.Data }).catch(() => {});

    // 8. Update Session
    this.currentKey = newKey;
    
    return { success: true };
  }

  // --- PRIVACY ---
  async enablePrivacyScreen(options: { enabled: boolean }): Promise<void> {
    console.log(`[Privacy] Flag Secure: ${options.enabled}`);
  }

  // --- BIOMETRICS (Real WebAuthn) ---
  async checkBiometricAvailability(): Promise<{ available: boolean }> {
    if (window.PublicKeyCredential) {
       const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
       return { available };
    }
    return { available: false };
  }

  async getBiometricStatus(): Promise<{ enabled: boolean }> {
    const { value } = await Preferences.get({ key: BIO_ENABLED_KEY });
    return { enabled: value === 'true' };
  }

  async setBiometricStatus(options: { enabled: boolean; password?: string }): Promise<void> {
    await Preferences.set({ key: BIO_ENABLED_KEY, value: String(options.enabled) });
  }

  async authenticateBiometric(): Promise<{ success: boolean; password?: string }> {
     try {
       if (!window.PublicKeyCredential) throw new Error("WebAuthn not supported");
       
       const challenge = new Uint8Array(32);
       window.crypto.getRandomValues(challenge);

       await navigator.credentials.create({
         publicKey: {
           challenge,
           rp: { name: "SecureVault Local" },
           user: {
             id: new Uint8Array(16),
             name: "user",
             displayName: "Vault Owner"
           },
           pubKeyCredParams: [{ alg: -7, type: "public-key" }],
           authenticatorSelection: { authenticatorAttachment: "platform" },
           timeout: 60000,
           attestation: "direct"
         }
       });
       
       return { success: true }; 
     } catch (e) {
       return { success: false };
     }
  }

  // --- DECOY ---
  async setDecoyCredential(options: { decoyPassword: string; masterPassword: string }): Promise<{ success: boolean }> {
    const saltRes = await Preferences.get({ key: SALT_KEY });
    if (!saltRes.value) throw new Error("Vault error");

    const verifier = await CryptoService.hashForVerification(options.decoyPassword, saltRes.value);
    await Preferences.set({ key: VERIFIER_DECOY, value: verifier });
    
    // Init empty decoy vault
    const key = await CryptoService.deriveKey(options.decoyPassword, saltRes.value);
    await StorageService.saveMetadata('DECOY', [], key);

    return { success: true };
  }

  async removeDecoyCredential(password: string): Promise<{ success: boolean }> {
    await Preferences.remove({ key: VERIFIER_DECOY });
    await Filesystem.deleteFile({ path: `${VAULT_DIR}/meta_decoy.json`, directory: Directory.Data }).catch(() => {});
    return { success: true };
  }

  async hasDecoy(): Promise<{ hasDecoy: boolean }> {
    const { value } = await Preferences.get({ key: VERIFIER_DECOY });
    return { hasDecoy: !!value };
  }

  // --- RESET ---
  async resetVault(password: string): Promise<{ success: boolean }> {
    // Verify first
    const saltRes = await Preferences.get({ key: SALT_KEY });
    const realRes = await Preferences.get({ key: VERIFIER_REAL });
    
    const inputHash = await CryptoService.hashForVerification(password, saltRes.value || '');
    if (inputHash !== realRes.value) throw new Error("Incorrect Password");

    // Wipe Keys
    await Preferences.clear();
    
    // Wipe Data
    try {
      await Filesystem.rmdir({
        path: VAULT_DIR,
        directory: Directory.Data,
        recursive: true
      });
    } catch(e) {}

    this.currentKey = null;
    this.sessionActive = false;
    this.vaultCache = [];
    
    return { success: true };
  }

  // --- INTRUDER (Real Camera with Fallback) ---
  
  async getIntruderSettings(): Promise<IntruderSettings> {
    const { value } = await Preferences.get({ key: INTRUDER_CONFIG_KEY });
    if (value) {
      return JSON.parse(value) as IntruderSettings;
    }
    return { enabled: false, photoCount: 1, source: 'FRONT' };
  }

  async setIntruderSettings(settings: IntruderSettings): Promise<void> {
    await Preferences.set({ key: INTRUDER_CONFIG_KEY, value: JSON.stringify(settings) });
  }

  async checkCameraPermission(): Promise<{ granted: boolean }> {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(t => t.stop());
          return { granted: true };
      } catch (e) {
          return { granted: false };
      }
  }

  private async takePhoto(facingMode: 'user' | 'environment'): Promise<Blob | null> {
      try {
          const constraints: MediaStreamConstraints = {
              video: { facingMode: facingMode }
          };
          
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const track = stream.getVideoTracks()[0];
          let blob: Blob | null = null;

          // 1. Try ImageCapture (Modern/Native)
          if ('ImageCapture' in window) {
              try {
                  const imageCapture = new (window as any).ImageCapture(track);
                  blob = await imageCapture.takePhoto();
              } catch(e) {
                  console.log("ImageCapture failed, fallback to canvas");
              }
          }

          // 2. Fallback to Canvas (Universal)
          if (!blob) {
              const video = document.createElement('video');
              video.srcObject = stream;
              // Wait for video to be ready
              await new Promise<void>((resolve) => {
                  video.onloadedmetadata = () => {
                      video.play().then(() => resolve());
                  };
              });
              
              // Small delay to let camera adjust exposure
              await new Promise(r => setTimeout(r, 500));

              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              if(ctx) {
                  ctx.drawImage(video, 0, 0);
                  blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg'));
              }
          }
          
          track.stop();
          stream.getTracks().forEach(t => t.stop());
          return blob;

      } catch (e) {
          console.error(`Camera ${facingMode} failed`, e);
          return null;
      }
  }

  async captureIntruderEvidence(): Promise<void> {
    const settings = await this.getIntruderSettings();
    if (!settings.enabled) return;

    const strategies: ('user' | 'environment')[] = [];

    // Determine sequence based on settings
    // If source is FRONT, take N front photos.
    // If source is BACK, take N back photos.
    // If source is BOTH, we alternate or take one of each depending on count.
    // For specific requirement "Front + Back", if Count is 1, it's ambiguous.
    // We will assume "Both" means "Cycle sources".
    
    if (settings.source === 'FRONT') {
        for(let i=0; i<settings.photoCount; i++) strategies.push('user');
    } else if (settings.source === 'BACK') {
        for(let i=0; i<settings.photoCount; i++) strategies.push('environment');
    } else {
        // BOTH
        // If count 1: Front
        // If count 2: Front, Back
        // If count 3: Front, Back, Front
        strategies.push('user');
        if (settings.photoCount >= 2) strategies.push('environment');
        if (settings.photoCount >= 3) strategies.push('user');
    }

    const sessionId = Date.now(); // Common timestamp for grouping

    // Execute sequence
    for (let i = 0; i < strategies.length; i++) {
        const mode = strategies[i];
        const blob = await this.takePhoto(mode);
        if (blob) {
            // Save to Pending
            const filename = `intruder_${sessionId}_${i}_${mode}.jpg`;
            const reader = new FileReader();
            
            await new Promise<void>((resolve) => {
                reader.onloadend = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    try {
                        await Filesystem.writeFile({
                            path: `${VAULT_DIR}/pending_intruders/${filename}`,
                            data: base64,
                            directory: Directory.Data,
                            recursive: true
                        });
                    } catch(e) {}
                    resolve();
                };
                reader.readAsDataURL(blob);
            });
        }
    }
  }

  async getIntruderLogs(): Promise<IntruderSession[]> {
    if (!this.sessionActive || this.currentMode !== 'REAL') return [];

    // 1. Check for pending intruders and import them
    try {
      // Ensure dir exists before reading
      await StorageService.init(); 

      const pending = await Filesystem.readdir({
         path: `${VAULT_DIR}/pending_intruders`,
         directory: Directory.Data
      });
      
      for (const file of pending.files) {
         const data = await Filesystem.readFile({
            path: `${VAULT_DIR}/pending_intruders/${file.name}`,
            directory: Directory.Data
         });
         
         // Convert base64 back to blob
         const byteCharacters = atob(data.data as string);
         const byteNumbers = new Array(byteCharacters.length);
         for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
         }
         const byteArray = new Uint8Array(byteNumbers);
         const blob = new Blob([byteArray], { type: 'image/jpeg' });

         // Import to Vault (Encrypt)
         // Filename format: intruder_TIMESTAMP_INDEX_MODE.jpg
         await this.importFile({
            fileBlob: blob,
            fileName: file.name,
            password: '' // Key is already loaded in 'this.currentKey'
         });

         // Delete pending
         await Filesystem.deleteFile({
            path: `${VAULT_DIR}/pending_intruders/${file.name}`,
            directory: Directory.Data
         });
      }
    } catch (e) {
       // No pending intruders folder or empty
    }

    // 2. Return from vault cache
    const intruderFiles = this.vaultCache.filter(i => i.originalName.startsWith('intruder_'));
    
    // Grouping Logic by TIMESTAMP
    const sessionsMap = new Map<number, VaultItem[]>();
    intruderFiles.forEach(file => {
        // format: intruder_TIMESTAMP_INDEX_MODE.jpg
        const parts = file.originalName.split('_');
        if (parts.length >= 2) {
             const ts = parseInt(parts[1]);
             if (!isNaN(ts)) {
                if (!sessionsMap.has(ts)) sessionsMap.set(ts, []);
                sessionsMap.get(ts)?.push(file);
                return;
             }
        }
        // Fallback to importedAt if format fails
        const ts = file.importedAt; 
        if (!sessionsMap.has(ts)) sessionsMap.set(ts, []);
        sessionsMap.get(ts)?.push(file);
    });

    const sessions: IntruderSession[] = [];
    sessionsMap.forEach((files, ts) => {
        sessions.push({
            id: ts.toString(),
            timestamp: ts,
            attempts: 1, // Placeholder
            images: files
        });
    });

    return sessions.sort((a, b) => b.timestamp - a.timestamp);
  }

  async deleteIntruderSession(options: { timestamp: number }): Promise<{ success: boolean }> {
      // Find files by timestamp in name or importedAt
      // We rely on the grouping logic matching the timestamp
      const logs = await this.getIntruderLogs(); // get current grouping to find file IDs
      const session = logs.find(s => s.timestamp === options.timestamp);
      
      if (session) {
          for(const f of session.images) {
              await this.deleteVaultFile({ id: f.id });
          }
      }
      return { success: true };
  }
}

// Register as default implementation
export const SecureVault = new SecureVaultImplementation();