/**
 * FILE OPENING SYSTEM DOCUMENTATION
 * =====================================
 *
 * A comprehensive, production-ready file opening system for SecureVault
 * with platform-aware handling across web and native (Capacitor) environments.
 *
 * TABLE OF CONTENTS
 * =====================================
 * 1. Architecture Overview
 * 2. Core Services
 * 3. Usage Examples
 * 4. Configuration
 * 5. Error Handling
 * 6. Platform-Specific Behavior
 * 7. Security Considerations
 * 8. Testing
 * 9. Troubleshooting
 */

// ============================================================================
// 1. ARCHITECTURE OVERVIEW
// ============================================================================

/**
 * The file opening system is built on a layered architecture:
 *
 *  ┌─────────────────────────────────────┐
 *  │      Application / UI Layer         │
 *  │   (FileViewer.tsx, VaultList.tsx)   │
 *  └────────────────┬────────────────────┘
 *                   │
 *  ┌────────────────▼────────────────────┐
 *  │    FileOpenService (Orchestrator)   │
 *  │   - Platform detection              │
 *  │   - File type detection             │
 *  │   - Method selection (in-app/native)│
 *  │   - Progress tracking               │
 *  │   - Error handling                  │
 *  └────────┬──────────────────┬─────────┘
 *           │                  │
 *  ┌────────▼──────┐  ┌────────▼──────────────┐
 *  │ FileTypeDetect│  │FilePreviewService    │
 *  │ - Extension   │  │- Thumbnails          │
 *  │ - Magic bytes │  │- Caching             │
 *  │ - MIME type   │  │- Metadata generation │
 *  └───────────────┘  └─────────────────────┘
 *           │                  │
 *  ┌────────▼──────────────────▼──────────┐
 *  │    NativeFileOpener (Capacitor)      │
 *  │   - Android/iOS file opening         │
 *  │   - Temp file management             │
 *  │   - Permission checks                │
 *  │   - Platform detection               │
 *  └──────────────────────────────────────┘
 *
 * SEPARATION OF CONCERNS:
 * - FileTypeDetector: Responsible ONLY for type detection
 * - FilePreviewService: Responsible ONLY for preview generation
 * - NativeFileOpener: Responsible ONLY for native platform interaction
 * - FileOpenService: Orchestrates all components
 */

// ============================================================================
// 2. CORE SERVICES
// ============================================================================

/**
 * FILE TYPE DETECTOR SERVICE
 * ========================
 * Location: services/FileTypeDetector.ts
 *
 * Responsibility: Robustly detect file types using multiple methods
 *
 * Methods:
 * - detectType(blob, fileName): Comprehensive detection
 * - canPreviewInApp(category): Check in-app capability
 * - requiresNativeOpener(category): Check native requirement
 * - formatFileSize(bytes): Format for UI
 *
 * Detection Priority:
 * 1. Magic bytes (file signature) - 95% confidence
 * 2. File extension - 80% confidence
 * 3. MIME type from blob - 60% confidence
 * 4. Default fallback - 10% confidence
 *
 * Supports:
 * - Images: JPG, PNG, GIF, WebP, SVG, BMP, TIFF, ICO
 * - Video: MP4, WebM, Ogg, MOV, MKV, AVI, WMV, FLV
 * - Audio: MP3, WAV, M4A, AAC, FLAC, Ogg, WMA, Opus
 * - Documents: PDF, DOC, DOCX, ODT, RTF, PAGES
 * - Spreadsheets: XLS, XLSX, ODS, NUMBERS
 * - Archives: ZIP, RAR, 7Z, TAR, GZ, BZ2, XZ
 * - Mobile: APK
 * - Text: TXT, CSV, JSON, XML, HTML, JS, TS, Python, Java, etc.
 *
 * Example:
 *   const detection = await FileTypeDetector.detectType(blob, 'document.pdf');
 *   console.log(detection.category);        // 'PDF'
 *   console.log(detection.confidence);      // 0.95
 *   console.log(detection.suggestedMethod); // 'IN_APP'
 */

/**
 * FILE PREVIEW SERVICE
 * ===================
 * Location: services/FilePreviewService.ts
 *
 * Responsibility: Generate thumbnails, metadata, and manage caching
 *
 * Key Features:
 * - Generates thumbnails for images and video first frames
 * - Extracts file metadata (name, size, MIME type, category)
 * - Maintains encrypted cache with automatic eviction
 * - Respects cache size limits (default 50MB)
 * - Secure wipe of cache on app exit
 * - Placeholder icons for unsupported types
 *
 * Methods:
 * - generateMetadata(blob, fileName, fileId, generateThumbnail)
 * - clearCache(): Wipe all cached data
 * - getCacheSizeMb(): Get current cache size
 * - setMaxCacheSizeMb(sizeMb): Update limit
 *
 * Cache Behavior:
 * - Stores thumbnails up to size limit
 * - LRU eviction when limit exceeded
 * - 24-hour TTL per thumbnail
 * - Returns existing cached thumbnails on subsequent calls
 *
 * Example:
 *   const metadata = await FilePreviewService.generateMetadata(
 *     imageBlob,
 *     'photo.jpg',
 *     'file-uuid-123'
 *   );
 *   console.log(metadata.thumbnail);  // Base64 data URL
 *   console.log(metadata.canPreviewInApp);  // true
 */

/**
 * NATIVE FILE OPENER SERVICE
 * ==========================
 * Location: services/NativeFileOpener.ts
 *
 * Responsibility: Handle native file opening on Android/iOS via Capacitor
 *
 * Key Features:
 * - Platform detection (Android/iOS/Web)
 * - Safe file copying to temp directory
 * - Secure wipe of temp files after use
 * - Automatic cleanup on app startup
 * - Graceful web platform handling
 *
 * Requires Plugin (optional):
 *   npm install @capacitor-community/file-opener
 *
 * Methods:
 * - isNativeAvailable(): Check if native
 * - isFileOpenerAvailable(): Check plugin availability
 * - openFile(path, mimeType): Open with native app
 * - copyToTempDirectory(blob, fileName): Safe copying
 * - securelyWipeFile(path): Overwrite + delete
 * - cleanupTempFiles(olderThanMs): Maintenance
 *
 * Platform Info:
 * - getPlatformInfo(): Get platform details
 * - isAndroid() / isIOS() / isWeb(): Platform checks
 *
 * Example:
 *   if (NativeFileOpener.isNativeAvailable()) {
 *     const tempPath = await NativeFileOpener.copyToTempDirectory(blob, 'document.docx');
 *     await NativeFileOpener.openFile(tempPath, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 *     // Cleanup after delay
 *     setTimeout(() => NativeFileOpener.securelyWipeFile(tempPath), 10000);
 *   }
 */

/**
 * FILE OPEN SERVICE (ORCHESTRATOR)
 * ================================
 * Location: services/FileOpenService.ts
 *
 * Responsibility: Orchestrate all file opening logic
 *
 * Main API:
 *   openFile(blob, fileName, options?)
 *
 * Returns FileOpenResult:
 * {
 *   success: boolean;
 *   method: 'IN_APP' | 'NATIVE' | 'DOWNLOAD' | 'UNSUPPORTED';
 *   uri: string | null;         // Preview URI or null
 *   category: FileTypeCategory; // Detected file type
 *   error?: string;             // Error message
 *   wasDecrypted?: boolean;     // Vault decryption flag
 *   tempPath?: string;          // Temp file path
 * }
 *
 * Configuration:
 * {
 *   maxInMemorySize: 100 (MB),           // Stream larger files
 *   generateThumbnails: true,            // Thumbnail generation
 *   cacheThumbnails: true,               // Cache management
 *   maxCacheSize: 50 (MB),               // Cache limit
 *   secureWipeTempFiles: true,           // Secure cleanup
 *   operationTimeout: 30000 (ms),        // Timeout
 * }
 *
 * Key Features:
 * - Automatic platform detection
 * - In-app preview for images, video, PDF, text
 * - Native fallback for complex formats
 * - Download fallback for web
 * - Progress tracking for large files
 * - Vault file decryption support
 * - Comprehensive error handling
 * - Graceful degradation on web
 *
 * Example (Basic):
 *   const result = await FileOpenService.openFile(
 *     fileBlob,
 *     'document.pdf'
 *   );
 *   if (result.success) {
 *     showPreview(result.uri, result.method);
 *   } else {
 *     showError(result.error);
 *   }
 */

// ============================================================================
// 3. USAGE EXAMPLES
// ============================================================================

/**
 * EXAMPLE 1: Open a regular file
 * ==============================
 */
async function openRegularFile(blob: Blob, fileName: string) {
  try {
    const result = await FileOpenService.openFile(blob, fileName);

    if (result.success) {
      if (result.method === "IN_APP") {
        // Display in app preview (web/native)
        showPreviewModal(result.uri, result.category);
      } else if (result.method === "NATIVE") {
        // Native app opened the file
        showNotification("Opening with system app...");
      } else if (result.method === "DOWNLOAD") {
        // File downloaded to user's device
        showNotification("File downloaded");
      }
    } else {
      // Show user-friendly error
      showError(result.error);
    }
  } catch (error) {
    showError("Failed to open file");
  }
}

/**
 * EXAMPLE 2: Open encrypted vault file with progress tracking
 * ===========================================================
 */
async function openVaultFile(
  vaultItem: VaultItem,
  password: string,
  decryptionKey: CryptoKey
) {
  try {
    // Load encrypted file from vault
    const encryptedBlob = await StorageService.loadFile(
      vaultItem.id,
      decryptionKey
    );

    const result = await FileOpenService.openFile(
      encryptedBlob,
      vaultItem.originalName,
      {
        isVaultFile: true,
        vaultFileId: vaultItem.id,
        vaultPassword: password,
        decryptionKey,

        // Progress tracking
        onProgress: (progress) => {
          updateProgressBar(progress.percent);
          if (progress.estimatedTimeRemaining) {
            updateEstimatedTime(progress.estimatedTimeRemaining);
          }
        },

        // Prefer native for DOCX/XLSX
        preferNative: ["DOCUMENT", "SPREADSHEET"].includes(result.category),
      }
    );

    if (result.success) {
      showSecurePreview(result.uri, result.category);
    } else {
      showError(result.error || "Failed to open vault file");
    }
  } catch (error) {
    showError("Decryption or opening failed");
  }
}

/**
 * EXAMPLE 3: Enhanced FileViewer integration
 * ==========================================
 */
export const FileViewer: React.FC<FileViewerProps> = ({
  item,
  uri,
  onClose,
}) => {
  const [category, setCategory] = useState<FileTypeCategory>("UNKNOWN");
  const [textContent, setTextContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detect file type on mount
  useEffect(() => {
    const detectType = async () => {
      try {
        const detection = await FileTypeDetector.detectType(
          new Blob([item.originalName], { type: item.mimeType }),
          item.originalName
        );
        setCategory(detection.category);
      } catch (err) {
        setError("Type detection failed");
      }
    };

    detectType();
  }, [item]);

  // Load text content with error handling
  useEffect(() => {
    if (category === "TEXT" && uri) {
      fetch(uri)
        .then((r) => r.text())
        .then(setTextContent)
        .catch((err) => setError(`Failed to load: ${err.message}`))
        .finally(() => setLoading(false));
    }
  }, [category, uri]);

  // Render based on category
  return (
    <div className="file-viewer">
      {error && <ErrorMessage message={error} onClose={onClose} />}
      {category === "IMAGE" && <img src={uri} alt="Preview" />}
      {category === "VIDEO" && <video src={uri} controls />}
      {category === "TEXT" && <pre>{textContent}</pre>}
      {category === "PDF" && <iframe src={uri} />}
      {category === "UNKNOWN" && <UnsupportedMessage />}
    </div>
  );
};

/**
 * EXAMPLE 4: List view with thumbnails
 * ===================================
 */
async function generateListItems(vaultItems: VaultItem[]) {
  const items = [];

  for (const item of vaultItems) {
    try {
      // Load file from vault
      const blob = await StorageService.loadFile(item.id, decryptionKey);

      // Generate metadata with thumbnail
      const metadata = await FilePreviewService.generateMetadata(
        blob,
        item.originalName,
        item.id,
        true // generateThumbnail
      );

      items.push({
        id: item.id,
        name: metadata.name,
        size: metadata.sizeFormatted,
        thumbnail: metadata.thumbnail, // Base64 image
        canPreviewInApp: metadata.canPreviewInApp,
        category: metadata.category,
      });
    } catch (error) {
      // Fallback for error
      items.push({
        id: item.id,
        name: item.originalName,
        size: FileTypeDetector.formatFileSize(item.size),
        thumbnail: FilePreviewService.getPlaceholderIcon(item.mimeType as any),
        canPreviewInApp: false,
      });
    }
  }

  return items;
}

/**
 * EXAMPLE 5: Configuration customization
 * ======================================
 */
async function setupFileOpenService() {
  // Initialize with custom config
  await FileOpenService.initialize({
    maxInMemorySize: 200, // 200MB threshold
    generateThumbnails: true, // Enable thumbnails
    cacheThumbnails: true, // Cache them
    maxCacheSize: 100, // 100MB cache
    secureWipeTempFiles: true, // Secure cleanup
    operationTimeout: 60000, // 60 second timeout
  });

  // Optionally update later
  FileOpenService.updateConfig({
    maxCacheSize: 50, // Reduce cache
  });

  // On app shutdown
  window.addEventListener("beforeunload", async () => {
    await FileOpenService.cleanup();
  });
}

// ============================================================================
// 4. CONFIGURATION
// ============================================================================

/**
 * INITIALIZATION (Optional)
 * =========================
 * Call once at app startup to set custom configuration
 */
async function initializeApp() {
  // Initialize file opening system
  await FileOpenService.initialize({
    maxInMemorySize: 100, // Files larger than 100MB will stream
    generateThumbnails: true,
    cacheThumbnails: true,
    maxCacheSize: 50, // Max 50MB thumbnail cache
    secureWipeTempFiles: true, // Important for vault files
    operationTimeout: 30000,
  });

  // Set up cleanup on app exit
  window.addEventListener("beforeunload", async () => {
    await FileOpenService.cleanup();
  });

  console.log("File opening system ready");
}

/**
 * RUNTIME CONFIG UPDATES
 * ======================
 */
// Increase cache if needed
FileOpenService.updateConfig({ maxCacheSize: 100 });

// Get current config
const config = FileOpenService.getConfig();
console.log("Max in-memory size:", config.maxInMemorySize, "MB");

/**
 * FILE TYPE MAPPING TABLE
 * ======================
 *
 * Category      | Extensions             | MIME Types                | In-App | Native
 * ============|========================|========================|======|========
 * IMAGE       | jpg,png,gif,webp,svg   | image/*                 | ✓     | ✓
 * VIDEO       | mp4,webm,mov,mkv       | video/*                 | ✓     | ✓
 * AUDIO       | mp3,wav,m4a,flac       | audio/*                 | ✓     | ✓
 * PDF         | pdf                    | application/pdf         | ✓     | ✓
 * TEXT        | txt,json,csv,xml,md    | text/*, application/json| ✓     | ✓
 * DOCUMENT    | doc,docx,odt,rtf       | application/*word*      | -     | ✓
 * SPREADSHEET | xls,xlsx,ods           | application/*sheet*     | -     | ✓
 * ARCHIVE     | zip,rar,7z,tar         | application/*archive*   | -     | ✓
 * APK         | apk                    | application/apk         | -     | ✓
 * UNKNOWN     | [other]                | application/octet-stream| -     | -
 *
 * Legend:
 * ✓ = Supported
 * - = Not supported (fallback to alternative)
 */

// ============================================================================
// 5. ERROR HANDLING
// ============================================================================

/**
 * ERROR SCENARIOS & HANDLING
 * ==========================
 */

// Scenario 1: File too large for in-app memory
// Response: Automatically stream from blob:// URL instead of data URL

// Scenario 2: Native app not available (on web)
// Response: Fall back to download or show unsupported message

// Scenario 3: Decryption fails
// Response: Show user-friendly error "Failed to decrypt vault file"

// Scenario 4: Network timeout
// Response: Show "Operation timed out" + retry option

// Scenario 5: Permission denied
// Response: Show "Permission denied. Check app permissions."

// Scenario 6: Unknown MIME type
// Response: Show unsupported message with file details

/**
 * USER-FRIENDLY ERROR MESSAGES
 * ============================
 */
const errorMessages: Record<string, string> = {
  "Failed to decrypt": "Unable to decrypt file. Check your password.",
  "not found": "File not found or was deleted.",
  permission: "Permission denied. Check app permissions.",
  MIME: "Unrecognized file format.",
  timeout: "Operation took too long. Try with a smaller file.",
  network: "Network error. Check your connection.",
  unsupported: "This file type is not supported in this app.",
};

/**
 * RETRY LOGIC EXAMPLE
 * ===================
 */
async function openFileWithRetry(
  blob: Blob,
  fileName: string,
  maxRetries = 3
): Promise<FileOpenResult | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await FileOpenService.openFile(blob, fileName);
      if (result.success) return result;

      // Don't retry for unsupported types
      if (result.method === "UNSUPPORTED") {
        return result;
      }
    } catch (error) {
      if (attempt === maxRetries) {
        console.error("Max retries exceeded:", error);
        return null;
      }
      // Wait before retry (exponential backoff)
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

// ============================================================================
// 6. PLATFORM-SPECIFIC BEHAVIOR
// ============================================================================

/**
 * WEB PLATFORM
 * ============
 * - In-app previews: Enabled (blob:// URLs)
 * - Native file opener: Disabled
 * - Fallback: Download button for unsupported types
 * - Temp files: Uses browser cache
 * - Permissions: No special permissions needed
 *
 * Example:
 *   - PDF opens in iframe
 *   - Images display inline
 *   - Text shown in code block
 *   - DOCX triggers download
 */

/**
 * ANDROID
 * =======
 * - In-app previews: Enabled for native support
 * - Native file opener: Via Capacitor plugin
 * - Fallback: System chooser if multiple apps available
 * - Temp files: /data/data/app/cache/temp_files/
 * - Permissions: READ_EXTERNAL_STORAGE (if needed)
 *
 * Example:
 *   - DOCX opens in Word/Office
 *   - PDF opens in system PDF viewer
 *   - Images open in gallery
 *   - Video in default player
 */

/**
 * iOS
 * ===
 * - In-app previews: Enabled for native support
 * - Native file opener: Via Capacitor plugin
 * - Fallback: App share sheet
 * - Temp files: /tmp/ or app Documents
 * - Permissions: NSLocalNetworkUsageDescription (if needed)
 *
 * Example:
 *   - DOCX opens in iCloud/Pages
 *   - PDF opens in system viewer
 *   - Images open in Photos
 *   - Video in default player
 */

/**
 * RUNTIME PLATFORM DETECTION
 * ==========================
 */
if (NativeFileOpener.isNativeAvailable()) {
  if (NativeFileOpener.isAndroid()) {
    console.log("Running on Android");
    // Android-specific logic
  } else if (NativeFileOpener.isIOS()) {
    console.log("Running on iOS");
    // iOS-specific logic
  }
} else {
  console.log("Running on web platform");
  // Web-specific logic
}

// Get full platform info
const info = FileOpenService.getPlatformInfo();
console.log(info.platform); // 'android' | 'ios' | 'web'

// ============================================================================
// 7. SECURITY CONSIDERATIONS
// ============================================================================

/**
 * SECURE VAULT FILE HANDLING
 * ==========================
 *
 * For files within the encrypted vault:
 *
 * 1. Decryption:
 *    - Happens in-memory only
 *    - Uses established decryption key
 *    - Original encrypted file untouched
 *
 * 2. Preview:
 *    - In-app: blob:// URLs (stays in memory)
 *    - Native: Temporary file on secure storage
 *
 * 3. Cleanup:
 *    - Temp files securely wiped (overwritten before deletion)
 *    - Blob URLs revoked after use
 *    - Cache cleared on app exit
 *
 * 4. No Exposure:
 *    - Decrypted data never written to persistent storage
 *    - No plain-text files created
 *    - Temp files owned by app only
 */

/**
 * SECURE FILE CLEANUP EXAMPLE
 * ==========================
 */
async function secureOpenVaultFile(vaultItem: VaultItem, key: CryptoKey) {
  // Track temp file if created
  let tempFilePath: string | null = null;

  try {
    // Load and decrypt
    const blob = await StorageService.loadFile(vaultItem.id, key);

    // Open (may create temp file)
    const result = await FileOpenService.openFile(
      blob,
      vaultItem.originalName,
      {
        isVaultFile: true,
        vaultFileId: vaultItem.id,
        decryptionKey: key,
      }
    );

    if (result.success) {
      tempFilePath = result.tempPath || null;
      return result;
    }
  } finally {
    // Always cleanup temp file
    if (tempFilePath) {
      try {
        await FileOpenService.secureWipeData(tempFilePath);
        console.log("Temp file securely wiped");
      } catch (error) {
        console.warn("Failed to wipe temp file:", error);
      }
    }
  }
}

/**
 * CACHE SECURITY
 * ==============
 * - Thumbnails not stored on disk permanently
 * - Cache cleared on app exit
 * - Secure wipe overwrites memory before deletion
 * - No plaintext vault content in cache
 */

// ============================================================================
// 8. TESTING
// ============================================================================

/**
 * UNIT TESTS INCLUDED
 * ==================
 * File: services/FileOpenService.test.ts
 *
 * Coverage:
 * ✓ File type detection (extension, magic bytes, MIME)
 * ✓ In-app preview capability checks
 * ✓ Native opener availability
 * ✓ Error handling and messaging
 * ✓ Thumbnail generation and caching
 * ✓ Large file handling
 * ✓ Platform detection
 * ✓ Edge cases (special chars, no extension, etc.)
 *
 * Run tests:
 *   npm test -- FileOpenService.test.ts
 *
 * Test Categories:
 * - FileTypeDetector tests (detection accuracy)
 * - FilePreviewService tests (caching, thumbnails)
 * - NativeFileOpener tests (platform detection)
 * - FileOpenService tests (integration)
 * - Edge cases and error handling
 * - Performance tests (detection speed)
 */

// ============================================================================
// 9. TROUBLESHOOTING
// ============================================================================

/**
 * COMMON ISSUES & SOLUTIONS
 * =========================
 */

// Issue: Files not opening on Android
// Solution: Ensure @capacitor-community/file-opener is installed and configured

// Issue: Large files crash the app
// Solution: Increase maxInMemorySize config or use streaming (automatic)

// Issue: Thumbnails not caching
// Solution: Check cacheThumbnails is true and maxCacheSize is sufficient

// Issue: Encrypted files show as unsupported
// Solution: Ensure isVaultFile flag is set and decryptionKey provided

// Issue: "Operation timed out" error
// Solution: Increase operationTimeout or reduce file size

// Issue: File opens wrong app on Android
// Solution: System chooser will appear for multiple handlers

// Issue: Permission denied error
// Solution: Check app manifest permissions and request at runtime if needed

/**
 * DEBUG LOGGING
 * =============
 */
function enableDebugLogging() {
  // Check file type detection
  FileTypeDetector.detectType(blob, "file.pdf").then((result) => {
    console.debug("[FileTypeDetector]", result);
  });

  // Check platform
  console.debug("[Platform]", FileOpenService.getPlatformInfo());

  // Check cache
  console.debug("[Cache]", {
    sizeMb: FilePreviewService.getCacheSizeMb(),
    entries: FilePreviewService.getCacheEntryCount(),
  });
}

/**
 * PERFORMANCE MONITORING
 * =====================
 */
async function measureFileOpenPerformance(blob: Blob, fileName: string) {
  const start = performance.now();

  const result = await FileOpenService.openFile(blob, fileName, {
    onProgress: (progress) => {
      console.debug(`[Progress] ${progress.percent}%`);
    },
  });

  const duration = performance.now() - start;
  console.debug(`[Performance] Opened in ${duration}ms`, result);

  // Log result
  console.debug("[Result]", {
    success: result.success,
    method: result.method,
    category: result.category,
    durationMs: duration,
  });
}

// ============================================================================
// END OF DOCUMENTATION
// ============================================================================
