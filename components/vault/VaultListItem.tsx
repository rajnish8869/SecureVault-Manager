import React from 'react';
import type { VaultItem } from '../../types';
import { Icons, getFileIcon } from '../icons/Icons';

export const VaultListItem: React.FC<{ 
  item: VaultItem;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onView: (item: VaultItem) => void;
}> = ({ item, onDelete, onExport, onView }) => {
  return (
    <div 
      className="p-4 hover:bg-vault-700/30 transition-colors flex items-center justify-between group cursor-pointer relative"
      onClick={() => onView(item)}
    >
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="w-10 h-10 rounded-lg bg-vault-700 flex items-center justify-center text-vault-400 shrink-0">
          {getFileIcon(item.mimeType, item.originalName)}
        </div>
        <div className="min-w-0">
          <h4 className="font-medium text-white truncate">{item.originalName}</h4>
          <p className="text-xs text-vault-400 truncate font-mono">
            {(item.size / 1024 / 1024).toFixed(2)} MB • {new Date(item.importedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex gap-1 relative z-10">
          <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onExport(item.id); 
          }}
          className="p-2 text-vault-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
          title="Decrypt & Export"
        >
          <Icons.Download />
        </button>
        <button 
          type="button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onDelete(item.id); 
          }}
          className="p-2 text-vault-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          title="Delete Permanently"
        >
          <Icons.Trash />
        </button>
      </div>
    </div>
  );
};