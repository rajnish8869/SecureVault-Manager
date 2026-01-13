export type LockType = 'PIN' | 'PASSWORD';

export interface VaultItem {
  id: string;
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

export interface EncryptionPlugin {
  /**
   * Checks if the vault has been set up with credentials.
   */
  isInitialized(): Promise<{ initialized: boolean }>;

  /**
   * Sets the initial credentials for the vault.
   * Can only be called if isInitialized() returns false.
   */
  initializeVault(options: { 
    password: string; 
    type: LockType 
  }): Promise<{ success: boolean }>;

  /**
   * Initializes the vault session. 
   * Returns the mode: 'REAL' or 'DECOY' depending on which password was entered.
   */
  unlockVault(password: string): Promise<{ success: boolean; mode: 'REAL' | 'DECOY' }>;

  /**
   * Imports a file into the active vault (Real or Decoy):
   */
  importFile(options: { 
    fileBlob: Blob; 
    fileName: string; 
    password: string 
  }): Promise<VaultItem>;

  /**
   * Retrieves metadata of files inside the currently active vault.
   */
  getVaultFiles(): Promise<VaultItem[]>;

  /**
   * Permanently deletes a file from the active vault.
   */
  deleteVaultFile(options: { id: string }): Promise<{ success: boolean }>;

  /**
   * Decrypts and saves the file back to public downloads folder.
   */
  exportFile(options: { id: string; password: string }): Promise<{ success: boolean; exportedPath: string }>;

  /**
   * Decrypts a file for temporary preview.
   */
  previewFile(options: { id: string; password: string }): Promise<{ uri: string }>;

  /**
   * Gets the current lock configuration.
   */
  getLockType(): Promise<{ type: LockType }>;

  /**
   * Updates the REAL vault credentials.
   */
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
  /**
   * Blocks screenshots and hides app content in Recents menu.
   */
  enablePrivacyScreen(options: { enabled: boolean }): Promise<void>;

  // --- DECOY VAULT ---

  /**
   * Sets or Updates the Decoy PIN/Password.
   * The type (PIN/Pass) MUST match the main vault type to keep the login UI identical.
   */
  setDecoyCredential(options: { 
    decoyPassword: string; 
    masterPassword: string; // Required to authorize creation
  }): Promise<{ success: boolean }>;

  /**
   * Removes the Decoy functionality.
   */
  removeDecoyCredential(password: string): Promise<{ success: boolean }>;

  /**
   * Checks if a decoy is currently configured (for UI status).
   */
  hasDecoy(): Promise<{ hasDecoy: boolean }>;

  // --- INTRUDER SELFIE ---
  
  /**
   * Triggers the silent capture sequence.
   * Designed to be fire-and-forget.
   */
  captureIntruderEvidence(): Promise<void>;

  /**
   * Retrieves grouped intruder logs.
   */
  getIntruderLogs(): Promise<IntruderSession[]>;

  /**
   * Clears specific intruder logs.
   */
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