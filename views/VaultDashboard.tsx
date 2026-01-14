import React, { useRef } from 'react';
import { Card, VaultList, FloatingActionButton, Icons } from '../components/UI';
import type { VaultItem } from '../types';

interface VaultDashboardProps {
  items: VaultItem[];
  isDecoy: boolean;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onView: (item: VaultItem) => void;
  onLock: () => void;
  onSettings: () => void;
  onPickStart: () => void; // To prevent auto-lock during file pick
}

export const VaultDashboard: React.FC<VaultDashboardProps> = ({ 
    items, isDecoy, onImport, onDelete, onExport, onView, onLock, onSettings, onPickStart 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFabClick = () => {
      onPickStart();
      fileInputRef.current?.click();
  };

  return (
    <div className="pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className={`sticky top-0 z-40 backdrop-blur-md border-b p-4 flex items-center justify-between transition-colors ${isDecoy ? 'bg-slate-900/80 border-slate-800' : 'bg-vault-900/80 border-vault-800'}`}>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <span className={isDecoy ? "text-slate-500" : "text-vault-accent"}><Icons.Shield /></span>
              {isDecoy ? 'Private Vault' : 'My Vault'}
            </h2>
            <div className="flex gap-2">
              {!isDecoy && (
               <button onClick={onSettings} className="p-2 text-vault-400 hover:text-white transition-colors">
                <Icons.Cog />
               </button>
              )}
              <button onClick={onLock} className="p-2 text-vault-400 hover:text-white transition-colors">
                <Icons.Lock />
              </button>
            </div>
        </header>

        <main className="p-4 max-w-3xl mx-auto space-y-4">
            <div className={`border p-4 rounded-xl text-sm flex gap-3 ${isDecoy ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-200'}`}>
              <div className="shrink-0 mt-0.5"><Icons.Unlock /></div>
              <p>Files imported here are encrypted and removed from public storage. They are only accessible within this app.</p>
            </div>

            <Card className="min-h-[50vh]">
              <VaultList 
                items={items} 
                onDelete={onDelete} 
                onExport={onExport}
                onView={onView}
              />
            </Card>
        </main>
        
        <input type="file" multiple ref={fileInputRef} onChange={onImport} className="hidden" />
        <FloatingActionButton onClick={handleFabClick} />
    </div>
  );
};