import type { FileTypeDetectionResult, FileTypeCategory } from "../types";

/**
 * FileTypeDetector: Robust file type detection using multiple methods
 * - Extension-based detection (fast, reliable)
 * - Magic bytes/file signature detection (accurate even without extension)
 * - MIME type sniffing (fallback)
 *
 * Returns a confidence score and suggested handling method.
 */

// Magic byte signatures (file headers) for accurate detection
const MAGIC_BYTES_MAP: Record<
  string,
  { bytes: number[]; category: FileTypeCategory; mimeType: string }
> = {
  // Images
  FFD8FF: {
    bytes: [0xff, 0xd8, 0xff],
    category: "IMAGE",
    mimeType: "image/jpeg",
  },
  "89504E47": {
    bytes: [0x89, 0x50, 0x4e, 0x47],
    category: "IMAGE",
    mimeType: "image/png",
  },
  "47494638": {
    bytes: [0x47, 0x49, 0x46, 0x38],
    category: "IMAGE",
    mimeType: "image/gif",
  },
  "52494646": {
    bytes: [0x52, 0x49, 0x46, 0x46],
    category: "IMAGE",
    mimeType: "image/webp",
  }, // RIFF (WebP/WAV)
  "00000020": {
    bytes: [0x00, 0x00, 0x00, 0x20],
    category: "IMAGE",
    mimeType: "image/x-icon",
  }, // ICO

  // PDF
  "25504446": {
    bytes: [0x25, 0x50, 0x44, 0x46],
    category: "PDF",
    mimeType: "application/pdf",
  },

  // Archives
  "504B0304": {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    category: "ARCHIVE",
    mimeType: "application/zip",
  },
  "504B0506": {
    bytes: [0x50, 0x4b, 0x05, 0x06],
    category: "ARCHIVE",
    mimeType: "application/zip",
  },
  "504B0708": {
    bytes: [0x50, 0x4b, 0x07, 0x08],
    category: "ARCHIVE",
    mimeType: "application/zip",
  },
  "526172211A07": {
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00],
    category: "ARCHIVE",
    mimeType: "application/x-rar-compressed",
  },
  "7A6578": {
    bytes: [0x7a, 0x78],
    category: "ARCHIVE",
    mimeType: "application/x-xz",
  },
  "37ZXYZ": {
    bytes: [0x37, 0x7a, 0x58, 0x5a],
    category: "ARCHIVE",
    mimeType: "application/x-7z-compressed",
  },
  "1F8B": {
    bytes: [0x1f, 0x8b],
    category: "ARCHIVE",
    mimeType: "application/gzip",
  },

  // Video/Audio
  "000000": {
    bytes: [0x00, 0x00, 0x00, 0x00],
    category: "VIDEO",
    mimeType: "video/mp4",
  }, // MP4 (ftyp)
  FTYPISOMISO2AVC1: {
    bytes: [0x66, 0x74, 0x79, 0x70],
    category: "VIDEO",
    mimeType: "video/mp4",
  },
  "1A45DFA3": {
    bytes: [0x1a, 0x45, 0xdf, 0xa3],
    category: "VIDEO",
    mimeType: "video/x-matroska",
  }, // MKV
  "664F7261": {
    bytes: [0x66, 0x6f, 0x72, 0x61],
    category: "VIDEO",
    mimeType: "video/quicktime",
  }, // MOV
  "4642414C": {
    bytes: [0x46, 0x4c, 0x61, 0x43],
    category: "AUDIO",
    mimeType: "audio/flac",
  }, // FLAC
  "49443": {
    bytes: [0x49, 0x44, 0x33],
    category: "AUDIO",
    mimeType: "audio/mpeg",
  }, // MP3
  "2123414F55": {
    bytes: [0x23, 0x21, 0x41, 0x4f, 0x55],
    category: "AUDIO",
    mimeType: "audio/x-oggflac",
  }, // Ogg
  "4F676753": {
    bytes: [0x4f, 0x67, 0x67, 0x53],
    category: "AUDIO",
    mimeType: "audio/ogg",
  },
  "524946464156": {
    bytes: [0x52, 0x49, 0x46, 0x46],
    category: "AUDIO",
    mimeType: "audio/wav",
  }, // RIFF/WAV

  // Office Documents
  D0CF11E0: {
    bytes: [0xd0, 0xcf, 0x11, 0xe0],
    category: "DOCUMENT",
    mimeType: "application/msword",
  }, // OLE (DOC/XLS/PPT)
  "504B0304504B": {
    bytes: [0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b],
    category: "DOCUMENT",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }, // DOCX
};

// Extension-to-MIME mapping with file categories
const EXTENSION_MAP: Record<
  string,
  {
    category: FileTypeCategory;
    mimeType: string;
    suggestedMethod: "IN_APP" | "NATIVE" | "UNSUPPORTED";
  }
> = {
  // Images (in-app preview preferred)
  jpg: { category: "IMAGE", mimeType: "image/jpeg", suggestedMethod: "IN_APP" },
  jpeg: {
    category: "IMAGE",
    mimeType: "image/jpeg",
    suggestedMethod: "IN_APP",
  },
  png: { category: "IMAGE", mimeType: "image/png", suggestedMethod: "IN_APP" },
  gif: { category: "IMAGE", mimeType: "image/gif", suggestedMethod: "IN_APP" },
  webp: {
    category: "IMAGE",
    mimeType: "image/webp",
    suggestedMethod: "IN_APP",
  },
  svg: {
    category: "IMAGE",
    mimeType: "image/svg+xml",
    suggestedMethod: "IN_APP",
  },
  bmp: { category: "IMAGE", mimeType: "image/bmp", suggestedMethod: "IN_APP" },
  ico: {
    category: "IMAGE",
    mimeType: "image/x-icon",
    suggestedMethod: "IN_APP",
  },
  tiff: {
    category: "IMAGE",
    mimeType: "image/tiff",
    suggestedMethod: "IN_APP",
  },
  tif: { category: "IMAGE", mimeType: "image/tiff", suggestedMethod: "IN_APP" },

  // Video (in-app preview preferred for common formats)
  mp4: { category: "VIDEO", mimeType: "video/mp4", suggestedMethod: "IN_APP" },
  webm: {
    category: "VIDEO",
    mimeType: "video/webm",
    suggestedMethod: "IN_APP",
  },
  ogg: { category: "VIDEO", mimeType: "video/ogg", suggestedMethod: "IN_APP" },
  mov: {
    category: "VIDEO",
    mimeType: "video/quicktime",
    suggestedMethod: "NATIVE",
  },
  mkv: {
    category: "VIDEO",
    mimeType: "video/x-matroska",
    suggestedMethod: "NATIVE",
  },
  flv: {
    category: "VIDEO",
    mimeType: "video/x-flv",
    suggestedMethod: "NATIVE",
  },
  avi: {
    category: "VIDEO",
    mimeType: "video/x-msvideo",
    suggestedMethod: "NATIVE",
  },
  wmv: {
    category: "VIDEO",
    mimeType: "video/x-ms-wmv",
    suggestedMethod: "NATIVE",
  },

  // Audio (in-app preferred for common, native for others)
  mp3: { category: "AUDIO", mimeType: "audio/mpeg", suggestedMethod: "IN_APP" },
  wav: { category: "AUDIO", mimeType: "audio/wav", suggestedMethod: "IN_APP" },
  m4a: { category: "AUDIO", mimeType: "audio/mp4", suggestedMethod: "IN_APP" },
  aac: { category: "AUDIO", mimeType: "audio/aac", suggestedMethod: "IN_APP" },
  flac: {
    category: "AUDIO",
    mimeType: "audio/flac",
    suggestedMethod: "IN_APP",
  },
  ogg_audio: {
    category: "AUDIO",
    mimeType: "audio/ogg",
    suggestedMethod: "IN_APP",
  },
  wma: {
    category: "AUDIO",
    mimeType: "audio/x-ms-wma",
    suggestedMethod: "NATIVE",
  },
  opus: {
    category: "AUDIO",
    mimeType: "audio/opus",
    suggestedMethod: "IN_APP",
  },

  // PDF (in-app preview)
  pdf: {
    category: "PDF",
    mimeType: "application/pdf",
    suggestedMethod: "IN_APP",
  },

  // Text (in-app preview)
  txt: { category: "TEXT", mimeType: "text/plain", suggestedMethod: "IN_APP" },
  text: { category: "TEXT", mimeType: "text/plain", suggestedMethod: "IN_APP" },
  csv: { category: "TEXT", mimeType: "text/csv", suggestedMethod: "IN_APP" },
  json: {
    category: "TEXT",
    mimeType: "application/json",
    suggestedMethod: "IN_APP",
  },
  xml: {
    category: "TEXT",
    mimeType: "application/xml",
    suggestedMethod: "IN_APP",
  },
  md: {
    category: "TEXT",
    mimeType: "text/markdown",
    suggestedMethod: "IN_APP",
  },
  markdown: {
    category: "TEXT",
    mimeType: "text/markdown",
    suggestedMethod: "IN_APP",
  },
  html: { category: "TEXT", mimeType: "text/html", suggestedMethod: "IN_APP" },
  htm: { category: "TEXT", mimeType: "text/html", suggestedMethod: "IN_APP" },
  js: {
    category: "TEXT",
    mimeType: "text/javascript",
    suggestedMethod: "IN_APP",
  },
  jsx: {
    category: "TEXT",
    mimeType: "text/javascript",
    suggestedMethod: "IN_APP",
  },
  ts: {
    category: "TEXT",
    mimeType: "text/typescript",
    suggestedMethod: "IN_APP",
  },
  tsx: {
    category: "TEXT",
    mimeType: "text/typescript",
    suggestedMethod: "IN_APP",
  },
  py: {
    category: "TEXT",
    mimeType: "text/x-python",
    suggestedMethod: "IN_APP",
  },
  java: {
    category: "TEXT",
    mimeType: "text/x-java-source",
    suggestedMethod: "IN_APP",
  },
  css: { category: "TEXT", mimeType: "text/css", suggestedMethod: "IN_APP" },
  sh: {
    category: "TEXT",
    mimeType: "text/x-shellscript",
    suggestedMethod: "IN_APP",
  },
  log: { category: "TEXT", mimeType: "text/plain", suggestedMethod: "IN_APP" },

  // Documents
  doc: {
    category: "DOCUMENT",
    mimeType: "application/msword",
    suggestedMethod: "NATIVE",
  },
  docx: {
    category: "DOCUMENT",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    suggestedMethod: "NATIVE",
  },
  odt: {
    category: "DOCUMENT",
    mimeType: "application/vnd.oasis.opendocument.text",
    suggestedMethod: "NATIVE",
  },
  rtf: {
    category: "DOCUMENT",
    mimeType: "application/rtf",
    suggestedMethod: "NATIVE",
  },
  pages: {
    category: "DOCUMENT",
    mimeType: "application/vnd.apple.pages",
    suggestedMethod: "NATIVE",
  },

  // Spreadsheets
  xls: {
    category: "SPREADSHEET",
    mimeType: "application/vnd.ms-excel",
    suggestedMethod: "NATIVE",
  },
  xlsx: {
    category: "SPREADSHEET",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    suggestedMethod: "NATIVE",
  },
  ods: {
    category: "SPREADSHEET",
    mimeType: "application/vnd.oasis.opendocument.spreadsheet",
    suggestedMethod: "NATIVE",
  },
  numbers: {
    category: "SPREADSHEET",
    mimeType: "application/vnd.apple.numbers",
    suggestedMethod: "NATIVE",
  },

  // Archives
  zip: {
    category: "ARCHIVE",
    mimeType: "application/zip",
    suggestedMethod: "NATIVE",
  },
  rar: {
    category: "ARCHIVE",
    mimeType: "application/x-rar-compressed",
    suggestedMethod: "NATIVE",
  },
  "7z": {
    category: "ARCHIVE",
    mimeType: "application/x-7z-compressed",
    suggestedMethod: "NATIVE",
  },
  tar: {
    category: "ARCHIVE",
    mimeType: "application/x-tar",
    suggestedMethod: "NATIVE",
  },
  gz: {
    category: "ARCHIVE",
    mimeType: "application/gzip",
    suggestedMethod: "NATIVE",
  },
  bz2: {
    category: "ARCHIVE",
    mimeType: "application/x-bzip2",
    suggestedMethod: "NATIVE",
  },
  xz: {
    category: "ARCHIVE",
    mimeType: "application/x-xz",
    suggestedMethod: "NATIVE",
  },

  // APK
  apk: {
    category: "APK",
    mimeType: "application/vnd.android.package-archive",
    suggestedMethod: "NATIVE",
  },

  // Unknown
  bin: {
    category: "UNKNOWN",
    mimeType: "application/octet-stream",
    suggestedMethod: "UNSUPPORTED",
  },
  exe: {
    category: "UNKNOWN",
    mimeType: "application/octet-stream",
    suggestedMethod: "UNSUPPORTED",
  },
  dll: {
    category: "UNKNOWN",
    mimeType: "application/octet-stream",
    suggestedMethod: "UNSUPPORTED",
  },
};

export class FileTypeDetector {
  /**
   * Detect file type from a Blob with multiple fallbacks
   * @param blob File blob to analyze
   * @param fileName Original file name with extension
   * @returns Detection result with confidence and suggested handling
   */
  static async detectType(
    blob: Blob,
    fileName: string
  ): Promise<FileTypeDetectionResult> {
    const extension = this.getExtension(fileName).toLowerCase();

    try {
      // Try magic bytes first (highest accuracy)
      const magicResult = await this.detectByMagicBytes(blob);
      if (magicResult) {
        return {
          ...magicResult,
          confidence: 0.95,
          detectedBy: "MAGIC_BYTES",
          extension,
        };
      }
    } catch (error) {
      // Fall through to extension-based detection
    }

    // Try extension-based detection
    const extensionResult = this.detectByExtension(extension);
    if (extensionResult) {
      return {
        ...extensionResult,
        confidence: 0.8,
        detectedBy: "EXTENSION",
        extension,
      };
    }

    // Try MIME type from blob
    if (blob.type) {
      return {
        mimeType: blob.type,
        category: this.categorizeMimeType(blob.type),
        confidence: 0.6,
        detectedBy: "MIME_TYPE",
        extension,
        suggestedMethod: "UNSUPPORTED",
      };
    }

    // Default: unknown
    return {
      mimeType: "application/octet-stream",
      category: "UNKNOWN",
      confidence: 0.1,
      detectedBy: "EXTENSION",
      extension,
      suggestedMethod: "UNSUPPORTED",
    };
  }

  /**
   * Detect file type from magic bytes (file signature)
   */
  private static async detectByMagicBytes(
    blob: Blob
  ): Promise<Omit<
    FileTypeDetectionResult,
    "extension" | "confidence" | "detectedBy"
  > | null> {
    const headerSize = Math.min(512, blob.size); // Read first 512 bytes
    const header = await blob.slice(0, headerSize).arrayBuffer();
    const bytes = new Uint8Array(header);

    // Convert first bytes to hex for comparison
    const hexSignature = Array.from(bytes.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    // Check against known signatures
    for (const [sig, config] of Object.entries(MAGIC_BYTES_MAP)) {
      if (hexSignature.startsWith(sig)) {
        return {
          mimeType: config.mimeType,
          category: config.category,
          suggestedMethod: this.suggestOpenerMethod(config.category),
        };
      }
    }

    // Special check for MP4 variants (ftyp box)
    if (hexSignature.includes("66747970") && bytes.length > 8) {
      const ftypBrand = String.fromCharCode(...bytes.slice(8, 12));
      if (ftypBrand.includes("isom") || ftypBrand.includes("mp4")) {
        return {
          mimeType: "video/mp4",
          category: "VIDEO",
          suggestedMethod: "IN_APP",
        };
      }
    }

    return null;
  }

  /**
   * Detect file type from extension
   */
  private static detectByExtension(
    ext: string
  ): Omit<
    FileTypeDetectionResult,
    "extension" | "confidence" | "detectedBy"
  > | null {
    const config = EXTENSION_MAP[ext];
    if (config) {
      return {
        mimeType: config.mimeType,
        category: config.category,
        suggestedMethod: config.suggestedMethod,
      };
    }
    return null;
  }

  /**
   * Categorize a MIME type into a file category
   */
  private static categorizeMimeType(mimeType: string): FileTypeCategory {
    if (mimeType.startsWith("image/")) return "IMAGE";
    if (mimeType.startsWith("video/")) return "VIDEO";
    if (mimeType.startsWith("audio/")) return "AUDIO";
    if (mimeType.includes("pdf")) return "PDF";
    if (mimeType.startsWith("text/")) return "TEXT";
    if (mimeType.includes("word") || mimeType.includes("document"))
      return "DOCUMENT";
    if (mimeType.includes("sheet") || mimeType.includes("excel"))
      return "SPREADSHEET";
    if (
      mimeType.includes("zip") ||
      mimeType.includes("rar") ||
      mimeType.includes("archive") ||
      mimeType.includes("tar") ||
      mimeType.includes("gzip")
    )
      return "ARCHIVE";
    if (mimeType.includes("apk") || mimeType.includes("android")) return "APK";
    return "UNKNOWN";
  }

  /**
   * Get file extension from filename
   */
  private static getExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf(".");
    return lastDot === -1 ? "" : fileName.substring(lastDot + 1);
  }

  /**
   * Suggest optimal opener method based on file category and platform
   */
  private static suggestOpenerMethod(
    category: FileTypeCategory
  ): "IN_APP" | "NATIVE" | "UNSUPPORTED" {
    const inAppCategories: FileTypeCategory[] = [
      "IMAGE",
      "VIDEO",
      "AUDIO",
      "PDF",
      "TEXT",
    ];
    return inAppCategories.includes(category) ? "IN_APP" : "NATIVE";
  }

  /**
   * Check if a file type can be previewed in-app
   */
  static canPreviewInApp(category: FileTypeCategory): boolean {
    return ["IMAGE", "VIDEO", "AUDIO", "PDF", "TEXT"].includes(category);
  }

  /**
   * Check if a file type requires native opener
   */
  static requiresNativeOpener(category: FileTypeCategory): boolean {
    return ["DOCUMENT", "SPREADSHEET", "ARCHIVE", "APK"].includes(category);
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Get MIME type for a file category
   */
  static getMimeTypeForCategory(
    category: FileTypeCategory,
    fallback?: string
  ): string {
    const mimeMap: Record<FileTypeCategory, string> = {
      IMAGE: "image/png",
      VIDEO: "video/mp4",
      AUDIO: "audio/mpeg",
      PDF: "application/pdf",
      TEXT: "text/plain",
      DOCUMENT: "application/octet-stream",
      SPREADSHEET: "application/octet-stream",
      ARCHIVE: "application/zip",
      APK: "application/vnd.android.package-archive",
      UNKNOWN: "application/octet-stream",
    };
    return mimeMap[category] || fallback || "application/octet-stream";
  }
}
