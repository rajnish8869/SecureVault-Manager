import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { SecureVault } from './plugins/SecureVaultPlugin';
import { Modal, DialogModal, ProcessingModal, FileViewer, Icons, Toggle, SegmentedControl, Button } from './components/UI';
import { useAuth } from './hooks/useAuth';
import { useVault } from './hooks/useVault';
import { useIntruder } from './hooks/useIntruder';
import { SetupView } from './views/SetupView';
import { LockScreen } from './views/LockScreen';
import { VaultDashboard } from './views/VaultDashboard';
import { SettingsView } from './views/SettingsView';
import { IntruderLogsView } from './views/IntruderLogsView';

type AppState = 'LOADING' | 'SETUP' | 'LOCKED' | 'VAULT' | 'SETTINGS' | 'INTRUDER_LOGS';

export default function App() {
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [password, setPassword] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const isPickingFile = useRef(false);

  // Hooks
  const auth = useAuth();
  const vault = useVault(password);
  const intruder = useIntruder();

  // Dialog System
  const [dialog, setDialog] = useState<any>({ isOpen: false });
  const closeDialog = () => setDialog({ ...dialog, isOpen: false });
  const showAlert = (title: string, msg: string) => setDialog({ isOpen: true, type: 'ALERT', title, message: msg, onConfirm: closeDialog, onCancel: closeDialog });
  const showConfirm = (title: string, msg: string, onConfirm: () => void, variant = 'info') => setDialog({ isOpen: true, type: 'CONFIRM', title, message: msg, variant, onConfirm: () => { closeDialog(); onConfirm(); }, onCancel: closeDialog });
  
  // Viewer State
  const [viewer, setViewer] = useState<{ item: any, uri: string | null } | null>(null);

  // Decoy State Logic (Local to App for session tracking)
  const [isDecoySession, setIsDecoySession] = useState(false);
  const failedAttempts = useRef(0);

  // --- Effects ---

  // 1. Initialization
  useEffect(() => {
    if (!auth.isInitialized) {
       // Check if truly not initialized or just loading
       // useAuth runs checkInit on mount. If it settles false, we go to SETUP.
       // We need a way to know if checkInit finished.
       // For now, simple timeout fallback or rely on isInitialized being false initially.
       // Better: auth.checkInit is async.
       // Let's assume useAuth initial state handling is sufficient, 
       // but we need to know when it's done.
       // We can watch for a change or check once manually.
       SecureVault.isInitialized().then(res => {
           if(res.initialized) {
               auth.checkInit().then(() => setAppState('LOCKED'));
           } else {
               setAppState('SETUP');
           }
       });
    }
  }, []); // Run once on mount

  // 2. Load Vault on Unlock
  useEffect(() => {
      if (appState === 'VAULT' && password) {
          vault.loadFiles();
      }
  }, [appState, password]);

  // 3. Auto-Lock
  useEffect(() => {
      const handleVis = () => {
          if (document.hidden && !isPickingFile.current && appState !== 'SETUP' && appState !== 'LOADING') {
              setAppState('LOCKED');
              setPassword(null);
              setIsDecoySession(false);
              failedAttempts.current = 0;
              setViewer(null);
              SecureVault.enablePrivacyScreen({ enabled: false });
          }
          if(!document.hidden && isPickingFile.current) {
              setTimeout(() => isPickingFile.current = false, 1000);
          }
      };
      document.addEventListener('visibilitychange', handleVis);
      return () => document.removeEventListener('visibilitychange', handleVis);
  }, [appState]);

  // --- Handlers ---

  const handleSetup = async (pw: string, type: any) => {
      setIsProcessing(true);
      try {
          await auth.setup(pw, type);
          setAppState('LOCKED');
          showAlert("Success", "Vault setup complete.");
      } catch(e: any) {
          showAlert("Error", e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleUnlock = async (pw: string) => {
      setIsProcessing(true);
      const res = await auth.unlock(pw);
      setIsProcessing(false);

      if (res.success) {
          setPassword(pw);
          setIsDecoySession(res.mode === 'DECOY');
          failedAttempts.current = 0;
          setAppState('VAULT');
      } else {
          failedAttempts.current++;
          if(failedAttempts.current % 2 === 0) {
              intruder.capture();
          }
      }
  };

  const handleBiometricUnlock = async () => {
      const pw = await auth.triggerBiometrics();
      if(pw) handleUnlock(pw);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      isPickingFile.current = false;
      const files = Array.from(e.target.files);
      setIsProcessing(true);
      setProgress(0);
      
      let success = 0;
      for (let i = 0; i < files.length; i++) {
          setProcessStatus(`Encrypting ${files[i].name}`);
          try {
              await vault.importFile(files[i]);
              success++;
          } catch(e) { console.error(e); }
          setProgress(((i+1)/files.length)*100);
      }
      setIsProcessing(false);
      e.target.value = '';
      if(success < files.length) showAlert("Import Report", `Imported ${success}/${files.length}`);
  };

  const handleView = async (item: any) => {
      setIsProcessing(true);
      try {
          const { uri } = await vault.previewFile(item.id);
          setViewer({ item, uri });
      } catch(e: any) {
          showAlert("Error", "Could not preview: " + e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDelete = (id: string) => {
      showConfirm("Delete File?", "This cannot be undone.", async () => {
          await vault.deleteFile(id);
      }, 'danger');
  };

  const handleExport = (id: string) => {
      showConfirm("Export File?", "File will be decrypted to public storage.", async () => {
          setIsProcessing(true);
          setProcessStatus("Decrypting...");
          try {
              const res = await vault.exportFile(id);
              showAlert("Success", `Saved to: ${res.exportedPath}`);
          } catch(e: any) {
              showAlert("Error", e.message);
          } finally {
              setIsProcessing(false);
          }
      });
  };

  const handleUpdateCreds = async (old: string, newPw: string, type: any) => {
      setIsProcessing(true);
      try {
          await auth.updateCredentials(old, newPw, type);
          setPassword(newPw);
          showAlert("Success", "Credentials updated.");
      } catch(e: any) {
          showAlert("Error", e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleReset = () => {
      setDialog({
          isOpen: true,
          type: 'PROMPT',
          title: 'Confirm Reset',
          message: 'Enter current password to wipe vault permanently.',
          inputProps: { type: 'password', placeholder: 'Current Password' },
          variant: 'danger',
          onCancel: closeDialog,
          onConfirm: async (val: string) => {
              closeDialog();
              if(!val) return;
              setIsProcessing(true);
              try {
                  await auth.reset(val);
                  setAppState('SETUP');
                  showAlert("Reset Complete", "Vault wiped.");
              } catch(e: any) {
                  showAlert("Reset Failed", e.message);
              } finally {
                  setIsProcessing(false);
              }
          }
      });
  };

  // Intruder Settings Modal State
  const [showIntruderModal, setShowIntruderModal] = useState(false);
  const [intruderSettingsForm, setIntruderSettingsForm] = useState<any>({ enabled: false, photoCount: 1, source: 'FRONT' });

  const openIntruderSettings = async () => {
      const s = await intruder.loadSettings();
      setIntruderSettingsForm(s);
      setShowIntruderModal(true);
  };

  const saveIntruderSettings = async () => {
      await intruder.saveSettings(intruderSettingsForm);
      setShowIntruderModal(false);
  };

  if (appState === 'LOADING') return <div className="min-h-screen bg-vault-900 flex items-center justify-center"><div className="w-8 h-8 border-4 border-vault-accent border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-vault-900 text-slate-100 font-sans">
        
        {appState === 'SETUP' && (
            <SetupView onSetup={handleSetup} isProcessing={isProcessing} />
        )}

        {appState === 'LOCKED' && (
            <LockScreen 
                lockType={auth.lockType}
                onUnlock={handleUnlock}
                onBiometricAuth={handleBiometricUnlock}
                error={auth.error}
                clearError={() => auth.setError(null)}
                isProcessing={isProcessing}
                bioEnabled={auth.bioEnabled}
                bioAvailable={auth.bioAvailable}
            />
        )}

        {appState === 'VAULT' && (
            <VaultDashboard 
                items={vault.items}
                isDecoy={isDecoySession}
                onImport={handleImport}
                onDelete={handleDelete}
                onExport={handleExport}
                onView={handleView}
                onLock={() => { setAppState('LOCKED'); setPassword(null); }}
                onSettings={() => setAppState('SETTINGS')}
                onPickStart={() => isPickingFile.current = true}
            />
        )}

        {appState === 'SETTINGS' && (
            <SettingsView 
                lockType={auth.lockType}
                bioAvailable={auth.bioAvailable}
                bioEnabled={auth.bioEnabled}
                hasDecoy={auth.hasDecoy}
                onBack={() => setAppState('VAULT')}
                onUpdateCredentials={handleUpdateCreds}
                onReset={handleReset}
                onToggleBio={() => auth.toggleBiometrics(!auth.bioEnabled, password!)}
                onSetupDecoy={(p, c) => auth.setupDecoy(p, password!)} // Assuming master pass is current session
                onRemoveDecoy={() => auth.removeDecoy(password!)}
                onOpenIntruder={openIntruderSettings}
                isProcessing={isProcessing}
            />
        )}

        {/* Intruder Settings Modal (kept internal to App or split to view? Kept here for simplicity of modal reuse) */}
        <Modal isOpen={showIntruderModal}>
            <div className="bg-vault-800 p-6 rounded-2xl w-full max-w-sm space-y-6 border border-vault-700">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-white">Intruder Settings</h3>
                    <button onClick={() => setShowIntruderModal(false)}><Icons.X /></button>
                </div>
                <div className="flex justify-between items-center bg-vault-900/50 p-3 rounded">
                    <span>Enabled</span>
                    <Toggle checked={intruderSettingsForm.enabled} onChange={v => setIntruderSettingsForm((s: any) => ({...s, enabled: v}))} />
                </div>
                {intruderSettingsForm.enabled && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                             <label className="text-xs font-bold text-vault-400">PHOTOS</label>
                             <SegmentedControl 
                                options={[{label:'1', value:1}, {label:'2', value:2}, {label:'3', value:3}]}
                                value={intruderSettingsForm.photoCount}
                                onChange={v => setIntruderSettingsForm((s: any) => ({...s, photoCount: v}))}
                             />
                        </div>
                        <div className="space-y-2">
                             <label className="text-xs font-bold text-vault-400">SOURCE</label>
                             <SegmentedControl 
                                options={[{label:'Front', value:'FRONT'}, {label:'Back', value:'BACK'}, {label:'Both', value:'BOTH'}]}
                                value={intruderSettingsForm.source}
                                onChange={v => setIntruderSettingsForm((s: any) => ({...s, source: v}))}
                                disabled={!Capacitor.isNativePlatform()}
                             />
                        </div>
                        <Button variant="outline" onClick={() => { setShowIntruderModal(false); setAppState('INTRUDER_LOGS'); }} className="w-full">
                            View Logs
                        </Button>
                    </div>
                )}
                <Button onClick={saveIntruderSettings} className="w-full">Save</Button>
            </div>
        </Modal>

        {appState === 'INTRUDER_LOGS' && (
            <IntruderLogsView 
                logs={intruder.logs}
                onDelete={intruder.deleteLog}
                onViewImage={handleView}
                onBack={() => { setAppState('SETTINGS'); setShowIntruderModal(false); }}
            />
        )}

        <ProcessingModal isOpen={isProcessing} status={processStatus} progress={progress} />
        
        <DialogModal 
            isOpen={dialog.isOpen}
            type={dialog.type || 'ALERT'}
            title={dialog.title}
            message={dialog.message}
            variant={dialog.variant}
            onConfirm={dialog.onConfirm}
            onCancel={dialog.onCancel}
            inputProps={dialog.inputProps}
        />

        {viewer && (
            <FileViewer 
                item={viewer.item} 
                uri={viewer.uri} 
                onClose={() => { 
                    setViewer(null); 
                    SecureVault.enablePrivacyScreen({ enabled: false }); 
                }} 
            />
        )}
    </div>
  );
}