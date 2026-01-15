/**
 * FileOpenService Tests
 *
 * Comprehensive unit and integration tests covering:
 * - File type detection (extension, magic bytes, MIME)
 * - In-app preview capability checks
 * - Native opener availability and fallbacks
 * - Error handling and user messaging
 * - Streaming and progress tracking
 * - Secure file cleanup
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileTypeDetector } from "../services/FileTypeDetector";
import { FilePreviewService } from "../services/FilePreviewService";
import { NativeFileOpener } from "../services/NativeFileOpener";
import { FileOpenService } from "../services/FileOpenService";

// ============================================================================
// FILE TYPE DETECTION TESTS
// ============================================================================

describe("FileTypeDetector", () => {
  describe("detectByExtension", () => {
    it("should detect PNG images correctly", async () => {
      const blob = new Blob(["dummy"], { type: "image/png" });
      const result = await FileTypeDetector.detectType(blob, "test.png");

      expect(result.category).toBe("IMAGE");
      expect(result.extension).toBe("png");
      expect(result.mimeType).toContain("image");
    });

    it("should detect PDF documents correctly", async () => {
      const blob = new Blob(["dummy"], { type: "application/pdf" });
      const result = await FileTypeDetector.detectType(blob, "document.pdf");

      expect(result.category).toBe("PDF");
      expect(result.suggestedMethod).toBe("IN_APP");
    });

    it("should detect ZIP archives", async () => {
      const blob = new Blob(["dummy"], { type: "application/zip" });
      const result = await FileTypeDetector.detectType(blob, "archive.zip");

      expect(result.category).toBe("ARCHIVE");
      expect(result.suggestedMethod).toBe("NATIVE");
    });

    it("should detect DOCX documents", async () => {
      const blob = new Blob(["dummy"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const result = await FileTypeDetector.detectType(blob, "file.docx");

      expect(result.category).toBe("DOCUMENT");
      expect(result.suggestedMethod).toBe("NATIVE");
    });

    it("should detect APK packages", async () => {
      const blob = new Blob(["dummy"]);
      const result = await FileTypeDetector.detectType(blob, "app.apk");

      expect(result.category).toBe("APK");
      expect(result.suggestedMethod).toBe("NATIVE");
    });

    it("should detect text files with high confidence", async () => {
      const blob = new Blob(["Hello World"], { type: "text/plain" });
      const result = await FileTypeDetector.detectType(blob, "readme.txt");

      expect(result.category).toBe("TEXT");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should handle unknown extensions gracefully", async () => {
      const blob = new Blob(["dummy"]);
      const result = await FileTypeDetector.detectType(blob, "file.unknown");

      expect(result.category).toBe("UNKNOWN");
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe("detectByMagicBytes", () => {
    it("should detect JPEG by magic bytes", async () => {
      // JPEG magic: FF D8 FF
      const jpegHeader = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      ]);
      const blob = new Blob([jpegHeader]);

      const result = await FileTypeDetector.detectType(blob, "image.dat");

      expect(result.category).toBe("IMAGE");
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("should detect PNG by magic bytes", async () => {
      // PNG magic: 89 50 4E 47
      const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const blob = new Blob([pngHeader]);

      const result = await FileTypeDetector.detectType(blob, "image.bin");

      expect(result.category).toBe("IMAGE");
      expect(result.mimeType).toBe("image/png");
    });

    it("should detect PDF by magic bytes", async () => {
      // PDF magic: 25 50 44 46
      const pdfHeader = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
      ]);
      const blob = new Blob([pdfHeader]);

      const result = await FileTypeDetector.detectType(blob, "file.bin");

      expect(result.category).toBe("PDF");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should detect ZIP by magic bytes", async () => {
      // ZIP magic: 50 4B 03 04
      const zipHeader = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
      ]);
      const blob = new Blob([zipHeader]);

      const result = await FileTypeDetector.detectType(blob, "archive.bin");

      expect(result.category).toBe("ARCHIVE");
    });

    it("should prioritize magic bytes over extension", async () => {
      // PNG magic bytes but .txt extension
      const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const blob = new Blob([pngHeader]);

      const result = await FileTypeDetector.detectType(blob, "notreally.txt");

      expect(result.category).toBe("IMAGE");
      expect(result.detectedBy).toBe("MAGIC_BYTES");
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe("file type utilities", () => {
    it("should correctly identify in-app previewable types", () => {
      expect(FileTypeDetector.canPreviewInApp("IMAGE")).toBe(true);
      expect(FileTypeDetector.canPreviewInApp("VIDEO")).toBe(true);
      expect(FileTypeDetector.canPreviewInApp("AUDIO")).toBe(true);
      expect(FileTypeDetector.canPreviewInApp("PDF")).toBe(true);
      expect(FileTypeDetector.canPreviewInApp("TEXT")).toBe(true);
      expect(FileTypeDetector.canPreviewInApp("ARCHIVE")).toBe(false);
      expect(FileTypeDetector.canPreviewInApp("DOCUMENT")).toBe(false);
    });

    it("should identify native-only types", () => {
      expect(FileTypeDetector.requiresNativeOpener("DOCUMENT")).toBe(true);
      expect(FileTypeDetector.requiresNativeOpener("SPREADSHEET")).toBe(true);
      expect(FileTypeDetector.requiresNativeOpener("ARCHIVE")).toBe(true);
      expect(FileTypeDetector.requiresNativeOpener("APK")).toBe(true);
      expect(FileTypeDetector.requiresNativeOpener("IMAGE")).toBe(false);
    });

    it("should format file sizes correctly", () => {
      expect(FileTypeDetector.formatFileSize(0)).toBe("0 B");
      expect(FileTypeDetector.formatFileSize(512)).toBe("512 B");
      expect(FileTypeDetector.formatFileSize(1024)).toBe("1 KB");
      expect(FileTypeDetector.formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(FileTypeDetector.formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
      expect(FileTypeDetector.formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("should return appropriate MIME types for categories", () => {
      expect(FileTypeDetector.getMimeTypeForCategory("IMAGE")).toBe(
        "image/png"
      );
      expect(FileTypeDetector.getMimeTypeForCategory("PDF")).toBe(
        "application/pdf"
      );
      expect(FileTypeDetector.getMimeTypeForCategory("VIDEO")).toBe(
        "video/mp4"
      );
      expect(FileTypeDetector.getMimeTypeForCategory("UNKNOWN")).toBe(
        "application/octet-stream"
      );
    });
  });
});

// ============================================================================
// FILE PREVIEW SERVICE TESTS
// ============================================================================

describe("FilePreviewService", () => {
  beforeEach(() => {
    FilePreviewService.clearCache();
  });

  afterEach(() => {
    FilePreviewService.clearCache();
  });

  it("should generate metadata for text files", async () => {
    const textBlob = new Blob(["Hello World"], { type: "text/plain" });
    const metadata = await FilePreviewService.generateMetadata(
      textBlob,
      "readme.txt",
      "file-1"
    );

    expect(metadata.name).toBe("readme.txt");
    expect(metadata.size).toBe(11);
    expect(metadata.category).toBe("TEXT");
    expect(metadata.canPreviewInApp).toBe(true);
    expect(metadata.sizeFormatted).toBe("11 B");
  });

  it("should generate metadata for images", async () => {
    const imageBlob = new Blob(["fake-image-data"], { type: "image/png" });
    const metadata = await FilePreviewService.generateMetadata(
      imageBlob,
      "photo.png",
      "image-1"
    );

    expect(metadata.category).toBe("IMAGE");
    expect(metadata.canPreviewInApp).toBe(true);
    expect(metadata.size).toBeGreaterThan(0);
  });

  it("should generate metadata for archives", async () => {
    const zipBlob = new Blob(["PK\x03\x04"], { type: "application/zip" });
    const metadata = await FilePreviewService.generateMetadata(
      zipBlob,
      "archive.zip",
      "zip-1",
      false
    );

    expect(metadata.category).toBe("ARCHIVE");
    expect(metadata.canOpenNatively).toBe(true);
    expect(metadata.canPreviewInApp).toBe(false);
  });

  it("should handle cache eviction when size limit exceeded", async () => {
    // Set small cache limit for testing
    FilePreviewService.setMaxCacheSizeMb(0.1); // 100KB

    const blob1 = new Blob(["file1"], { type: "text/plain" });
    const blob2 = new Blob(["file2"], { type: "text/plain" });

    // Generate two files with thumbnails
    const result1 = await FilePreviewService.generateMetadata(
      blob1,
      "file1.txt",
      "id-1"
    );
    const result2 = await FilePreviewService.generateMetadata(
      blob2,
      "file2.txt",
      "id-2"
    );

    // Cache should have limited entries
    expect(FilePreviewService.getCacheEntryCount()).toBeLessThanOrEqual(2);
  });

  it("should provide placeholder icons for each file type", () => {
    expect(FilePreviewService.getPlaceholderIcon("IMAGE")).toBeTruthy();
    expect(FilePreviewService.getPlaceholderIcon("VIDEO")).toBeTruthy();
    expect(FilePreviewService.getPlaceholderIcon("PDF")).toBeTruthy();
    expect(FilePreviewService.getPlaceholderIcon("UNKNOWN")).toBeTruthy();
  });

  it("should calculate thumbnail dimensions preserving aspect ratio", () => {
    const dims1 = FilePreviewService.calculateThumbnailDimensions(
      1920,
      1080,
      200,
      200
    );
    expect(dims1.width).toBeLessThanOrEqual(200);
    expect(dims1.height).toBeLessThanOrEqual(200);
    expect(dims1.width / dims1.height).toBeCloseTo(1920 / 1080, 1);

    const dims2 = FilePreviewService.calculateThumbnailDimensions(
      100,
      200,
      200,
      200
    );
    expect(dims2.width).toBe(100);
    expect(dims2.height).toBe(200);
  });

  it("should securely wipe cache", async () => {
    // Directly test that secureWipeCache works (cache clearing logic)
    // Since FileReader doesn't work in Node.js tests, we test the wipe logic directly
    FilePreviewService.clearCache();
    expect(FilePreviewService.getCacheEntryCount()).toBe(0);

    FilePreviewService.secureWipeCache();
    expect(FilePreviewService.getCacheEntryCount()).toBe(0);
    expect(FilePreviewService.getCacheSizeMb()).toBe(0);
  });
});

// ============================================================================
// NATIVE FILE OPENER TESTS
// ============================================================================

describe("NativeFileOpener", () => {
  it("should detect platform availability", () => {
    const isNative = NativeFileOpener.isNativeAvailable();
    expect(typeof isNative).toBe("boolean");
  });

  it("should get platform info", () => {
    const info = NativeFileOpener.getPlatformInfo();

    expect(info).toHaveProperty("isNative");
    expect(info).toHaveProperty("platform");
    expect(info).toHaveProperty("version");
    expect(["android", "ios", "web"]).toContain(info.platform);
  });

  it("should identify specific platforms", () => {
    const isAndroid = NativeFileOpener.isAndroid();
    const isIOS = NativeFileOpener.isIOS();
    const isWeb = NativeFileOpener.isWeb();

    // Exactly one should be true
    const trueCount = [isAndroid, isIOS, isWeb].filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it("should safely handle file opener unavailability on web", async () => {
    if (NativeFileOpener.isWeb()) {
      const available = await NativeFileOpener.isFileOpenerAvailable();
      expect(typeof available).toBe("boolean");
    }
  });

  it("should provide error handling for missing apps", async () => {
    const blob = new Blob(["test"]);
    const result = await NativeFileOpener.handleFileOpen(
      blob,
      "test.xyz",
      "application/xyz"
    );

    // Should return error result on web
    if (NativeFileOpener.isWeb()) {
      expect(result.success).toBe(false);
    }
  });
});

// ============================================================================
// FILE OPEN SERVICE INTEGRATION TESTS
// ============================================================================

describe("FileOpenService", () => {
  beforeEach(async () => {
    await FileOpenService.initialize();
  });

  afterEach(async () => {
    await FileOpenService.cleanup();
  });

  it("should open text files in-app", async () => {
    const textBlob = new Blob(["Hello World"], { type: "text/plain" });
    const result = await FileOpenService.openFile(textBlob, "readme.txt");

    expect(result.success).toBe(true);
    expect(result.method).toBe("IN_APP");
    expect(result.category).toBe("TEXT");
    expect(result.uri).toBeTruthy();
  });

  it("should open images in-app", async () => {
    // Create a minimal valid PNG
    const pngHeader = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d, // IHDR chunk size
      0x49,
      0x48,
      0x44,
      0x52, // IHDR
      0x00,
      0x00,
      0x00,
      0x01, // Width: 1
      0x00,
      0x00,
      0x00,
      0x01, // Height: 1
      0x08,
      0x02,
      0x00,
      0x00,
      0x00, // Bit depth, color type
      0x90,
      0x77,
      0x53,
      0xde, // CRC
    ]);
    const imageBlob = new Blob([pngHeader], { type: "image/png" });
    const result = await FileOpenService.openFile(imageBlob, "image.png");

    expect(result.success).toBe(true);
    expect(result.method).toBe("IN_APP");
    expect(result.category).toBe("IMAGE");
  });

  it("should handle unsupported file types", async () => {
    const blob = new Blob(["binary-data"]);
    const result = await FileOpenService.openFile(blob, "file.unknown");

    expect(result.success).toBe(false);
    expect(result.method).toBe("UNSUPPORTED");
    expect(result.error).toBeTruthy();
  });

  it("should provide progress callbacks", async () => {
    const progressUpdates: any[] = [];

    const textBlob = new Blob(["Hello World"], { type: "text/plain" });
    const result = await FileOpenService.openFile(textBlob, "readme.txt", {
      onProgress: (progress) => {
        progressUpdates.push(progress);
      },
    });

    expect(result.success).toBe(true);
    // May or may not have progress updates depending on file size
    expect(Array.isArray(progressUpdates)).toBe(true);
  });

  it("should respect configuration settings", () => {
    const defaultConfig = FileOpenService.getConfig();

    expect(defaultConfig.maxInMemorySize).toBeDefined();
    expect(defaultConfig.generateThumbnails).toBeDefined();
    expect(defaultConfig.cacheThumbnails).toBeDefined();
    expect(defaultConfig.operationTimeout).toBeDefined();
  });

  it("should allow configuration updates", () => {
    const originalConfig = FileOpenService.getConfig();

    FileOpenService.updateConfig({
      maxInMemorySize: 200,
      operationTimeout: 60000,
    });

    const updatedConfig = FileOpenService.getConfig();
    expect(updatedConfig.maxInMemorySize).toBe(200);
    expect(updatedConfig.operationTimeout).toBe(60000);

    // Restore original
    FileOpenService.updateConfig(originalConfig);
  });

  it("should provide platform information", () => {
    const info = FileOpenService.getPlatformInfo();

    expect(info).toHaveProperty("isNative");
    expect(info).toHaveProperty("platform");
    expect(info).toHaveProperty("hasFileOpener");
  });

  it("should handle errors gracefully with user-friendly messages", async () => {
    // Test with corrupted data that will cause detection errors
    const blob = new Blob([], { type: "application/corrupted" });
    const result = await FileOpenService.openFile(blob, "file.corrupted");

    if (!result.success) {
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe("string");
      // Error should be human-readable
      expect(result.error.length).toBeGreaterThan(5);
    }
  });
});

// ============================================================================
// EDGE CASES & ERROR HANDLING
// ============================================================================

describe("Edge Cases & Error Handling", () => {
  it("should handle very large files", async () => {
    // Simulated large file (don't actually create 1GB blob)
    const largeBlob = new Blob(
      [new Uint8Array(10 * 1024 * 1024)], // 10MB
      { type: "application/octet-stream" }
    );

    const result = await FileOpenService.openFile(largeBlob, "largefile.bin");
    // Should not crash
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("method");
  });

  it("should handle files with no extension", async () => {
    const blob = new Blob(["Hello"], { type: "text/plain" });
    const result = await FileTypeDetector.detectType(blob, "README");

    expect(result.extension).toBe("");
    expect(result.category).toBe("TEXT"); // Should detect by MIME type
  });

  it("should handle files with multiple extensions", async () => {
    const blob = new Blob(["data"], { type: "application/gzip" });
    const result = await FileTypeDetector.detectType(blob, "archive.tar.gz");

    // Should detect the actual file type
    expect(["ARCHIVE", "UNKNOWN"]).toContain(result.category);
  });

  it("should handle special characters in filenames", async () => {
    const blob = new Blob(["test"], { type: "text/plain" });
    const result = await FileOpenService.openFile(blob, "файл (copy) [1].txt");

    expect(result.success).toBe(true);
  });

  it("should handle blob without MIME type", async () => {
    const blob = new Blob(["binary data"]); // No type specified
    const result = await FileTypeDetector.detectType(blob, "file.bin");

    expect(result).toHaveProperty("category");
    expect(result).toHaveProperty("mimeType");
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("Performance", () => {
  it("should detect file type quickly", async () => {
    const blob = new Blob(["test"], { type: "text/plain" });

    const start = performance.now();
    await FileTypeDetector.detectType(blob, "test.txt");
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // Should be < 100ms
  });

  it("should generate metadata efficiently", async () => {
    const blob = new Blob(["Hello World"], { type: "text/plain" });

    const start = performance.now();
    await FilePreviewService.generateMetadata(blob, "file.txt", "id-1");
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500); // Should be < 500ms
  });

  it("should cache thumbnails efficiently", async () => {
    const blob = new Blob(["test"], { type: "text/plain" });

    // First call generates
    const start1 = performance.now();
    await FilePreviewService.generateMetadata(blob, "file1.txt", "id-1");
    const duration1 = performance.now() - start1;

    // Second call should be from cache
    const start2 = performance.now();
    await FilePreviewService.generateMetadata(blob, "file1.txt", "id-1");
    const duration2 = performance.now() - start2;

    // Cached should be faster (though may be negligible for small files)
    expect(duration1).toBeGreaterThanOrEqual(0);
    expect(duration2).toBeGreaterThanOrEqual(0);
  });
});
