import { useState, useCallback } from 'react';
import { SecureVault } from '../plugins/SecureVaultPlugin';
import type { VaultItem } from '../types';

export const useVault = (password: string | null) => {
  const [items, setItems] = useState<VaultItem[]>([]);
  
  const loadFiles = useCallback(async () => {
    if (!password) return;
    try {
      const files = await SecureVault.getVaultFiles();
      setItems(files);
    } catch (e) {
      console.error("Failed to load vault files", e);
    }
  }, [password]);

  const importFile = async (file: File, onProgress?: (p: number) => void) => {
    if (!password) throw new Error("No session");
    const newItem = await SecureVault.importFile({
        fileBlob: file,
        fileName: file.name,
        password
    });
    setItems(prev => [newItem, ...prev]);
    return newItem;
  };

  const deleteFile = async (id: string) => {
    await SecureVault.deleteVaultFile({ id });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const exportFile = async (id: string) => {
    if (!password) throw new Error("No session");
    return await SecureVault.exportFile({ id, password });
  };

  const previewFile = async (id: string) => {
    if (!password) throw new Error("No session");
    await SecureVault.enablePrivacyScreen({ enabled: true });
    return await SecureVault.previewFile({ id, password });
  };

  return {
    items,
    setItems,
    loadFiles,
    importFile,
    deleteFile,
    exportFile,
    previewFile
  };
};