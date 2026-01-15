import type { FileOpenResult, FileOpenConfig, StreamProgress } from "../types";
import { FileTypeDetector } from "./FileTypeDetector";
import { FilePreviewService } from "./FilePreviewService";
import { NativeFileOpener } from "./NativeFileOpener";
import { CryptoService } from "./CryptoService";
import { StorageService } from "./StorageService";

/**
 * FileOpenService: Main orchestrator for secure, platform-aware file opening
 *
 * Features:
 * - Robust file type detection (extension + magic bytes)
 * - Platform-aware handling (web vs native/Capacitor)
 * - In-app previews for images, video, PDF, text
 * - Native fallback for complex formats
 * - Secure decryption for vault files
 * - Streaming with progress tracking
 * - Memory-efficient handling of large files
 * - Comprehensive error handling with user-friendly messages
 * - Secure cleanup of temporary files
 *
 * Usage:
 *   const result = await FileOpenService.openFile(vaultItem, password, blob);
 *   if (result.success) {
 *     // Use result.uri for preview or handle native open
 *   } else {
 *     // Show error: result.error
 *   }
 */

interface DecryptedFileInfo {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export class FileOpenService {
  private static config: FileOpenConfig = {
    maxInMemorySize: 100, // MB
    generateThumbnails: true,
    cacheThumbnails: true,
    maxCacheSize: 50, // MB
    secureWipeTempFiles: true,
    operationTimeout: 30000, // 30 seconds
  };

  private static activeOperations = new Map<string, AbortController>();
  private static progressCallbacks = new Map<
    string,
    (progress: StreamProgress) => void
  >();

  /**
   * Initialize FileOpenService with custom config
   */
  static async initialize(
    customConfig?: Partial<FileOpenConfig>
  ): Promise<void> {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // Initialize native file opener on native platforms
    if (NativeFileOpener.isNativeAvailable()) {
      await NativeFileOpener.initialize();
    }

    console.debug("[FileOpenService] Initialized with config:", this.config);
  }

  /**
   * Main entry point: Open a file from vault or filesystem
   * Handles both encrypted vault files and regular files
   */
  static async openFile(
    blob: Blob,
    fileName: string,
    options?: {
      // Vault-specific
      isVaultFile?: boolean;
      vaultFileId?: string;
      vaultPassword?: string;
      decryptionKey?: CryptoKey;

      // Progress tracking
      onProgress?: (progress: StreamProgress) => void;

      // Behavior
      preferNative?: boolean;
      forceNative?: boolean;
    }
  ): Promise<FileOpenResult> {
    const operationId = `${options?.vaultFileId || fileName}_${Date.now()}`;
    const abortController = new AbortController();
    this.activeOperations.set(operationId, abortController);

    if (options?.onProgress) {
      this.progressCallbacks.set(operationId, options.onProgress);
    }

    try {
      // Set operation timeout
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, this.config.operationTimeout);

      try {
        const result = await this._openFileInternal(blob, fileName, {
          ...options,
          operationId,
          abortController,
        });
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error: any) {
      return this._handleError(error, fileName);
    } finally {
      this.activeOperations.delete(operationId);
      this.progressCallbacks.delete(operationId);
    }
  }

  /**
   * Internal implementation of file opening
   */
  private static async _openFileInternal(
    blob: Blob,
    fileName: string,
    options: {
      isVaultFile?: boolean;
      vaultFileId?: string;
      vaultPassword?: string;
      decryptionKey?: CryptoKey;
      onProgress?: (progress: StreamProgress) => void;
      preferNative?: boolean;
      forceNative?: boolean;
      operationId: string;
      abortController: AbortController;
    }
  ): Promise<FileOpenResult> {
    // Step 1: Detect file type
    const detection = await FileTypeDetector.detectType(blob, fileName);

    console.debug(
      `[FileOpenService] Opening file: ${fileName}`,
      `Category: ${detection.category}`,
      `Method: ${detection.suggestedMethod}`
    );

    // Step 2: Handle vault encryption if needed
    let fileToOpen = blob;
    let tempPath: string | undefined;

    if (options.isVaultFile && options.decryptionKey) {
      try {
        this._reportProgress(options.operationId, {
          total: blob.size,
          loaded: 0,
          percent: 0,
        });

        fileToOpen = await StorageService.loadFile(
          options.vaultFileId || "",
          options.decryptionKey
        );
        tempPath = `vault://${options.vaultFileId}`;

        this._reportProgress(options.operationId, {
          total: blob.size,
          loaded: blob.size,
          percent: 100,
        });
      } catch (error) {
        return {
          success: false,
          method: "UNSUPPORTED",
          uri: null,
          category: detection.category,
          error: "Failed to decrypt vault file",
        };
      }
    }

    // Step 3: Determine opener method
    const method = this._determineOpenerMethod(
      detection.category,
      fileToOpen.size,
      {
        preferNative: options.preferNative,
        forceNative: options.forceNative,
      }
    );

    // Step 4: Open based on method
    switch (method) {
      case "IN_APP":
        return this._openInApp(
          fileToOpen,
          fileName,
          detection.mimeType,
          detection.category
        );

      case "NATIVE":
        return this._openNative(
          fileToOpen,
          fileName,
          detection.mimeType,
          detection.category,
          tempPath
        );

      case "DOWNLOAD":
        return this._prepareDownload(
          fileToOpen,
          fileName,
          detection.mimeType,
          detection.category
        );

      case "UNSUPPORTED":
      default:
        return {
          success: false,
          method: "UNSUPPORTED",
          uri: null,
          category: detection.category,
          error: `File type not supported: ${detection.category}`,
        };
    }
  }

  /**
   * Open file in app (images, video, PDF, text)
   */
  private static async _openInApp(
    blob: Blob,
    fileName: string,
    mimeType: string,
    category: string
  ): Promise<FileOpenResult> {
    try {
      // For large files, stream instead of loading entirely
      let uri: string;

      if (blob.size > (this.config.maxInMemorySize || 100) * 1024 * 1024) {
        // Stream large file
        uri = URL.createObjectURL(blob);
      } else {
        // Small file - create data URL
        try {
          const base64 = await this._blobToBase64(blob);
          uri = `data:${mimeType};base64,${base64}`;
        } catch (base64Error) {
          // Fallback to blob URL if base64 fails
          uri = URL.createObjectURL(blob);
        }
      }

      return {
        success: true,
        method: "IN_APP",
        uri,
        category: category as any,
        wasDecrypted: false,
      };
    } catch (error: any) {
      return {
        success: false,
        method: "IN_APP",
        uri: null,
        category: category as any,
        error: `Failed to prepare in-app preview: ${error.message}`,
      };
    }
  }

  /**
   * Open file with native app
   */
  private static async _openNative(
    blob: Blob,
    fileName: string,
    mimeType: string,
    category: string,
    vaultTempPath?: string
  ): Promise<FileOpenResult> {
    if (!NativeFileOpener.isNativeAvailable()) {
      return {
        success: false,
        method: "NATIVE",
        uri: null,
        category: category as any,
        error: "Native file opener not available on this platform",
      };
    }

    try {
      const result = await NativeFileOpener.handleFileOpen(
        blob,
        fileName,
        mimeType
      );
      result.category = category as any;

      if (result.tempPath && this.config.secureWipeTempFiles) {
        // Schedule cleanup after a delay
        setTimeout(async () => {
          try {
            await NativeFileOpener.securelyWipeFile(result.tempPath!);
          } catch (error) {
            console.warn(
              "[FileOpenService] Failed to cleanup temp file:",
              error
            );
          }
        }, 10000); // 10 second delay to allow app to read file
      }

      return result;
    } catch (error: any) {
      return {
        success: false,
        method: "NATIVE",
        uri: null,
        category: category as any,
        error: error.message || "Failed to open with native app",
      };
    }
  }

  /**
   * Prepare file for download
   */
  private static async _prepareDownload(
    blob: Blob,
    fileName: string,
    mimeType: string,
    category: string
  ): Promise<FileOpenResult> {
    try {
      const url = URL.createObjectURL(blob);

      // Trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup after a moment
      setTimeout(() => URL.revokeObjectURL(url), 100);

      return {
        success: true,
        method: "DOWNLOAD",
        uri: null,
        category: category as any,
      };
    } catch (error: any) {
      return {
        success: false,
        method: "DOWNLOAD",
        uri: null,
        category: category as any,
        error: `Failed to download file: ${error.message}`,
      };
    }
  }

  /**
   * Determine optimal opener method based on file type and platform
   */
  private static _determineOpenerMethod(
    category: string,
    fileSize: number,
    options: { preferNative?: boolean; forceNative?: boolean } = {}
  ): "IN_APP" | "NATIVE" | "DOWNLOAD" | "UNSUPPORTED" {
    if (options.forceNative && NativeFileOpener.isNativeAvailable()) {
      return "NATIVE";
    }

    // In-app preview for these types
    if (
      ["IMAGE", "VIDEO", "AUDIO", "PDF", "TEXT"].includes(category) &&
      !options.preferNative
    ) {
      return "IN_APP";
    }

    // Native for complex formats
    if (["DOCUMENT", "SPREADSHEET", "ARCHIVE", "APK"].includes(category)) {
      if (NativeFileOpener.isNativeAvailable()) {
        return "NATIVE";
      }
      // Fallback to download on web
      if (NativeFileOpener.isWeb()) {
        return "DOWNLOAD";
      }
    }

    // Unknown or unsupported
    return "UNSUPPORTED";
  }

  /**
   * Cancel ongoing file operation
   */
  static cancelOperation(operationId: string): void {
    const controller = this.activeOperations.get(operationId);
    if (controller) {
      controller.abort();
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Report progress to caller
   */
  private static _reportProgress(
    operationId: string,
    progress: StreamProgress
  ): void {
    const callback = this.progressCallbacks.get(operationId);
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Convert blob to base64
   */
  private static _blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Handle and format errors
   */
  private static _handleError(error: any, fileName: string): FileOpenResult {
    console.error("[FileOpenService] Error opening file:", error);

    let userMessage = "Failed to open file";

    if (error instanceof DOMException && error.name === "AbortError") {
      userMessage = "Operation timed out. File may be too large.";
    } else if (error.message?.includes("decrypt")) {
      userMessage = "Failed to decrypt vault file. Check your password.";
    } else if (error.message?.includes("not found")) {
      userMessage = `File not found: ${fileName}`;
    } else if (error.message?.includes("permission")) {
      userMessage = "Permission denied. Check app permissions.";
    } else if (error.message?.includes("MIME")) {
      userMessage = "Unrecognized file format";
    }

    return {
      success: false,
      method: "UNSUPPORTED",
      uri: null,
      category: "UNKNOWN",
      error: userMessage,
    };
  }

  /**
   * Utility: Securely wipe sensitive data
   * Call when done with decrypted files
   */
  static async secureWipeData(filePath: string): Promise<void> {
    if (NativeFileOpener.isNativeAvailable()) {
      await NativeFileOpener.securelyWipeFile(filePath);
    }
  }

  /**
   * Get current config
   */
  static getConfig(): FileOpenConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  static updateConfig(updates: Partial<FileOpenConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get platform information
   */
  static getPlatformInfo() {
    return {
      isNative: NativeFileOpener.isNativeAvailable(),
      platform: NativeFileOpener.getPlatformInfo(),
      hasFileOpener: NativeFileOpener.isFileOpenerAvailable(),
    };
  }

  /**
   * Cleanup - call on app shutdown
   */
  static async cleanup(): Promise<void> {
    // Cancel all pending operations
    for (const [opId] of this.activeOperations) {
      this.cancelOperation(opId);
    }

    // Clean temp files (older than 1 hour)
    if (NativeFileOpener.isNativeAvailable()) {
      await NativeFileOpener.cleanupTempFiles(60 * 60 * 1000);
    }

    // Clear cache if enabled
    if (this.config.cacheThumbnails) {
      FilePreviewService.secureWipeCache();
    }
  }
}
