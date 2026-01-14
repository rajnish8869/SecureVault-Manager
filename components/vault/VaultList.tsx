import React from 'react';
import type { VaultItem } from '../../types';
import { Icons } from '../icons/Icons';
import { VaultListItem } from './VaultListItem';

export const VaultList: React.FC<{ 
  items: VaultItem[]; 
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onView: (item: VaultItem) => void;
}> = ({ items, onDelete, onExport, onView }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-vault-500 gap-4">
        <div className="w-16 h-16 rounded-full bg-vault-800 flex items-center justify-center">
          <Icons.File />
        </div>
        <p>Vault is empty</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-vault-700/50">
      {items.map(item => (
        <VaultListItem 
          key={item.id} 
          item={item} 
          onDelete={onDelete} 
          onExport={onExport} 
          onView={onView} 
        />
      ))}
    </div>
  );
};