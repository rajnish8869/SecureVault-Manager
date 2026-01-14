export type LockType = 'PIN' | 'PASSWORD';

export interface VaultItem {
  id: string;
  parentId?: string;
  type: 'FILE' | 'FOLDER';
  originalName: string;
  originalPath: string; // Stored for user reference
  mimeType: string;
  size: number;
  importedAt: number; // Timestamp
}

export interface IntruderSession {
  id: string;
  timestamp: number;
  attempts: number; // usually 1 session = 1 trigger
  images: VaultItem[];
}

export interface IntruderSettings {
  enabled: boolean;
  photoCount: 1 | 2 | 3;
  source: 'FRONT' | 'BACK' | 'BOTH';
}

export interface EncryptionPlugin {
  isInitialized(): Promise<{ initialized: boolean }>;

  initializeVault(options: { 
    password: string; 
    type: LockType 
  }): Promise<{ success: boolean }>;

  unlockVault(password: string): Promise<{ success: boolean; mode: 'REAL' | 'DECOY' }>;
  
  lockVault(): Promise<void>;

  importFile(options: { 
    fileBlob: Blob; 
    fileName: string; 
    password: string;
    parentId?: string;
  }): Promise<VaultItem>;

  createFolder(options: { name: string; parentId?: string }): Promise<VaultItem>;
  
  moveItems(options: { itemIds: string[]; targetParentId?: string }): Promise<{ success: boolean }>;
  
  copyItems(options: { itemIds: string[]; targetParentId?: string; password: string }): Promise<{ success: boolean }>;

  getVaultFiles(): Promise<VaultItem[]>;

  deleteVaultFile(options: { id: string }): Promise<{ success: boolean }>;
  
  deleteVaultItems(options: { ids: string[] }): Promise<{ success: boolean }>;

  exportFile(options: { id: string; password: string }): Promise<{ success: boolean; exportedPath: string }>;

  previewFile(options: { id: string; password: string }): Promise<{ uri: string }>;

  getLockType(): Promise<{ type: LockType }>;

  updateCredentials(options: { 
    oldPassword: string; 
    newPassword: string; 
    newType: LockType;
  }): Promise<{ success: boolean }>;

  // --- BIOMETRICS ---

  checkBiometricAvailability(): Promise<{ available: boolean }>;
  getBiometricStatus(): Promise<{ enabled: boolean }>;
  setBiometricStatus(options: { enabled: boolean; password?: string }): Promise<void>;
  authenticateBiometric(): Promise<{ success: boolean; password?: string }>;

  // --- RESET ---
  resetVault(password: string): Promise<{ success: boolean }>;

  // --- PRIVACY ---
  enablePrivacyScreen(options: { enabled: boolean }): Promise<void>;

  // --- DECOY VAULT ---
  setDecoyCredential(options: { 
    decoyPassword: string; 
    masterPassword: string;
  }): Promise<{ success: boolean }>;

  removeDecoyCredential(password: string): Promise<{ success: boolean }>;

  hasDecoy(): Promise<{ hasDecoy: boolean }>;

  // --- INTRUDER SELFIE ---
  getIntruderSettings(): Promise<IntruderSettings>;
  setIntruderSettings(settings: IntruderSettings): Promise<void>;
  checkCameraPermission(): Promise<{ granted: boolean }>;
  captureIntruderEvidence(): Promise<void>;
  getIntruderLogs(): Promise<IntruderSession[]>;
  deleteIntruderSession(options: { timestamp: number }): Promise<{ success: boolean }>;
}

export interface EncryptionResult {
  success: boolean;
  outputPath: string;
  stats?: {
    timeMs: number;
    fileSize: number;
  }
}