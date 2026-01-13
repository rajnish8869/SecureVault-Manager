import React, { useState, useEffect, useRef } from 'react';
import { SecureVault } from './plugins/SecureVaultPlugin';
import { Card, Button, PasswordInput, Icons, FloatingActionButton, VaultList, Modal, NumberPad, PinDisplay, FileViewer } from './components/UI';
import type { VaultItem, LockType, IntruderSession } from './types';

type AppState = 'LOADING' | 'SETUP' | 'LOCKED' | 'VAULT' | 'SETTINGS' | 'INTRUDER_LOGS';

export default function App() {
  const [state, setState] = useState<AppState>('LOADING');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [lockType, setLockType] = useState<LockType>('PASSWORD');
  
  // Decoy State
  const [isDecoySession, setIsDecoySession] = useState(false);
  const [hasDecoy, setHasDecoy] = useState(false);
  const [showDecoySetup, setShowDecoySetup] = useState(false);
  const [decoyForm, setDecoyForm] = useState({ pass: '', confirm: '' });

  // Biometrics
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  // Intruder Logic
  const failedAttemptsRef = useRef(0);
  const [intruderLogs, setIntruderLogs] = useState<IntruderSession[]>([]);
  const [selectedIntruderSession, setSelectedIntruderSession] = useState<IntruderSession | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // Viewer State
  const [viewingItem, setViewingItem] = useState<VaultItem | null>(null);
  const [viewingUri, setViewingUri] = useState<string | null>(null);

  // PIN Setup State
  const [pinStep, setPinStep] = useState<'CREATE' | 'CONFIRM'>('CREATE');
  const [tempPin, setTempPin] = useState('');

  // Hidden File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track if we are currently picking a file to prevent background auto-lock
  const isPickingFileRef = useRef(false);

  // Reset Modal State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetVerifyPass, setResetVerifyPass] = useState('');

  // Check initialization on boot
  useEffect(() => {
    async function checkInit() {
      try {
        const { initialized } = await SecureVault.isInitialized();
        if (!initialized) {
          setState('SETUP');
        } else {
          // Init logic
          const { type } = await SecureVault.getLockType();
          setLockType(type);
          
          // Check Biometrics
          const { available } = await SecureVault.checkBiometricAvailability();
          setBioAvailable(available);
          const { enabled } = await SecureVault.getBiometricStatus();
          setBioEnabled(enabled);
          
          // Check Decoy
          const decoyStatus = await SecureVault.hasDecoy();
          setHasDecoy(decoyStatus.hasDecoy);

          setState('LOCKED');

          // Auto-trigger biometric if enabled
          if (enabled) {
             triggerBiometricAuth();
          }
        }
      } catch (e) {
        console.error("Init check failed", e);
        setState('SETUP'); // Fallback
      }
    }
    checkInit();
  }, []);

  const triggerBiometricAuth = async () => {
    if(isProcessing) return;
    try {
      setError(null);
      const res = await SecureVault.authenticateBiometric();
      if (res.success && res.password) {
        // Success: Use retrieved password to unlock
        setPassword(res.password);
        handleUnlock(res.password);
      }
    } catch (e) {
      console.log("Biometric cancelled or failed", e);
    }
  }

  const handleUnlock = async (passToUse: string) => {
    if (!passToUse) return;
    setIsProcessing(true);
    setError(null);
    try {
      const res = await SecureVault.unlockVault(passToUse);
      
      // Success - Reset intruder count
      failedAttemptsRef.current = 0;

      // Check if this is a REAL or DECOY session
      setIsDecoySession(res.mode === 'DECOY');
      
      if (res.mode === 'DECOY') {
        console.log("Entering Decoy Mode");
      }

      const items = await SecureVault.getVaultFiles();
      setVaultItems(items);
      setState('VAULT');
      // Do NOT clear password here, it's needed for file encryption operations
    } catch (err: any) {
      // Failed Attempt Logic
      failedAttemptsRef.current += 1;
      const count = failedAttemptsRef.current;
      console.log(`Failed Attempts: ${count}`);

      if (count % 2 === 0) {
          // Trigger silent capture
          SecureVault.captureIntruderEvidence().catch(e => console.error("Intruder capture error", e));
      }

      setError(err.message || "Authentication failed");
      if(lockType === 'PIN') setPassword(''); // Reset PIN on error
    } finally {
      setIsProcessing(false);
    }
  };

  const onPinDigit = (d: string) => {
    if (isProcessing) return;
    if (password.length < 6) {
      const newPass = password + d;
      setPassword(newPass);
      // Auto unlock when 6 digits reached
      if (newPass.length === 6) {
        handleUnlock(newPass);
      }
    }
  };

  const onPinBackspace = () => {
    if (isProcessing) return;
    setPassword(p => p.slice(0, -1));
    setError(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    isPickingFileRef.current = false;
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    setIsProcessing(true);
    setProgress(0);
    const timer = setInterval(() => setProgress(p => Math.min(p + 5, 90)), 100);

    try {
      const newItem = await SecureVault.importFile({
        fileBlob: file,
        fileName: file.name,
        password: password
      });
      setVaultItems(prev => [newItem, ...prev]);
    } catch (err: any) {
      console.error(err);
      alert("Import Failed: " + err.message);
    } finally {
      clearInterval(timer);
      setProgress(0);
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- VIEWER HANDLER ---
  const handleViewFile = async (item: VaultItem) => {
      setIsProcessing(true);
      try {
          // 1. Enforce Privacy (Block Screenshots)
          await SecureVault.enablePrivacyScreen({ enabled: true });
          
          // 2. Decrypt for preview
          const { uri } = await SecureVault.previewFile({ id: item.id, password });
          setViewingUri(uri);
          setViewingItem(item);

      } catch (e: any) {
          alert("Could not open file: " + e.message);
          SecureVault.enablePrivacyScreen({ enabled: false });
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCloseViewer = () => {
      setViewingItem(null);
      setViewingUri(null);
      // Disable strict privacy mode (allow screenshots of vault list if desired, or keep enabled globally)
      // For UX, we usually allow screenshots of the list, but not the content.
      SecureVault.enablePrivacyScreen({ enabled: false });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure? This file will be permanently lost.")) return;
    try {
      await SecureVault.deleteVaultFile({ id });
      setVaultItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      alert("Delete failed");
    }
  };

  const handleExport = async (id: string) => {
    if (!window.confirm("Decrypt and export this file to Downloads?")) return;
    
    setIsProcessing(true);
    setProgress(20);
    const timer = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 200);

    try {
      const result = await SecureVault.exportFile({ id, password });
      clearInterval(timer);
      setProgress(100);
      setTimeout(() => {
        setIsProcessing(false);
        alert(`File Decrypted Successfully!\nSaved to: ${result.exportedPath}`);
      }, 300);
    } catch (err: any) {
      clearInterval(timer);
      setIsProcessing(false);
      alert("Export Failed: " + err.message);
    }
  };

  // --- SETTINGS LOGIC ---
  const [settingsForm, setSettingsForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    targetType: 'PASSWORD' as LockType
  });

  const handleSetupPinDigit = (d: string) => {
    if (isProcessing) return;
    if (settingsForm.newPassword.length < 6) {
      const newVal = settingsForm.newPassword + d;
      setSettingsForm(s => ({ ...s, newPassword: newVal }));
      
      if (newVal.length === 6) {
        if (pinStep === 'CREATE') {
          setTimeout(() => {
            setTempPin(newVal);
            setSettingsForm(s => ({ ...s, newPassword: '' })); 
            setPinStep('CONFIRM');
          }, 200);
        } else {
          if (newVal === tempPin) {
             setTimeout(() => {
               setSettingsForm(s => ({ ...s, confirmPassword: newVal })); 
               submitSetup(newVal, newVal, 'PIN');
             }, 200);
          } else {
             alert("PINs do not match. Try again.");
             setSettingsForm(s => ({ ...s, newPassword: '' }));
             setPinStep('CREATE');
             setTempPin('');
          }
        }
      }
    }
  };

  const handleSetupPinBackspace = () => {
    setSettingsForm(s => ({ ...s, newPassword: s.newPassword.slice(0, -1) }));
  };

  const submitSetup = async (newPass: string, confirmPass: string, type: LockType) => {
    setIsProcessing(true);
    try {
      await SecureVault.initializeVault({ password: newPass, type: type });
      setLockType(type);
      setSettingsForm({ oldPassword: '', newPassword: '', confirmPassword: '', targetType: 'PASSWORD' });
      setTempPin('');
      setPinStep('CREATE');
      setPassword(''); 
      setState('LOCKED');
      alert("Setup Complete! Please unlock your vault.");
    } catch (err: any) {
      alert("Setup Failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetupSubmit = async () => {
    if (settingsForm.newPassword !== settingsForm.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    await submitSetup(settingsForm.newPassword, settingsForm.confirmPassword, settingsForm.targetType);
  };

  const handleSettingsUpdate = async () => {
    if (settingsForm.newPassword !== settingsForm.confirmPassword) {
      alert("New passwords do not match");
      return;
    }

    setIsProcessing(true);
    try {
      await SecureVault.updateCredentials({
        oldPassword: settingsForm.oldPassword,
        newPassword: settingsForm.newPassword,
        newType: settingsForm.targetType
      });
      setPassword(settingsForm.newPassword);
      setLockType(settingsForm.targetType);
      alert("Settings updated successfully");
      setSettingsForm({ oldPassword: '', newPassword: '', confirmPassword: '', targetType: settingsForm.targetType });
      setState('VAULT');
    } catch (err: any) {
      alert("Update Failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const toggleBiometrics = async () => {
     try {
       const newStatus = !bioEnabled;
       if (newStatus && !password) {
         alert("Please re-enter your password/pin manually to enable biometrics.");
         return;
       }
       await SecureVault.setBiometricStatus({ enabled: newStatus, password: password });
       setBioEnabled(newStatus);
     } catch(e: any) {
       alert("Failed to change biometric settings: " + e.message);
     }
  };

  const handleResetVaultClick = () => {
     setShowResetConfirm(true);
     setResetVerifyPass('');
  };

  const performReset = async () => {
    setIsProcessing(true);
    try {
      await SecureVault.resetVault(resetVerifyPass);
      setState('SETUP');
      setVaultItems([]);
      setPassword('');
      setSettingsForm({ oldPassword: '', newPassword: '', confirmPassword: '', targetType: 'PASSWORD' });
      setLockType('PASSWORD');
      setPinStep('CREATE');
      setTempPin('');
      setShowResetConfirm(false);
      alert("Vault reset complete.");
    } catch (e: any) {
      alert("Reset failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- DECOY HANDLERS ---
  const handleDecoySetup = async () => {
    // 1. Validate inputs
    if (!decoyForm.pass || !decoyForm.confirm) {
      alert("Please enter a decoy code.");
      return;
    }

    if (decoyForm.pass !== decoyForm.confirm) {
      alert("Decoy codes do not match.");
      return;
    }

    // 2. Validate length based on type
    if (lockType === 'PIN' && decoyForm.pass.length !== 6) {
      alert("Decoy PIN must be exactly 6 digits.");
      return;
    }
    if (lockType === 'PASSWORD' && decoyForm.pass.length < 1) {
       alert("Decoy password cannot be empty.");
       return;
    }

    // 3. Use current session password (already verified when unlocking)
    let master = password;
    if (!master) {
       master = prompt("Please confirm your MASTER password:") || '';
       if (!master) return;
    }

    setIsProcessing(true);
    try {
      await SecureVault.setDecoyCredential({
        decoyPassword: decoyForm.pass,
        masterPassword: master
      });
      setHasDecoy(true);
      setShowDecoySetup(false);
      setDecoyForm({ pass: '', confirm: '' });
      alert("Decoy Vault Configured!\n\nEnter this code on the lock screen to access the fake vault.");
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveDecoy = async () => {
    if(!confirm("Remove Decoy Vault? This will wipe all files inside the decoy vault.")) return;
    
    // Use stored session password
    let master = password;
    if (!master) {
      master = prompt("Enter MASTER password to confirm:") || '';
      if (!master) return;
    }

    try {
      await SecureVault.removeDecoyCredential(master);
      setHasDecoy(false);
      alert("Decoy removed.");
    } catch (e: any) {
      alert(e.message);
    }
  };

  // --- INTRUDER HANDLERS ---
  const fetchIntruderLogs = async () => {
      const logs = await SecureVault.getIntruderLogs();
      setIntruderLogs(logs);
      setState('INTRUDER_LOGS');
  };

  const handleViewIntruderImage = async (img: VaultItem) => {
      try {
          // Decrypt purely for preview
          const { uri } = await SecureVault.previewFile({ id: img.id, password });
          setPreviewUri(uri);
      } catch (e) {
          alert("Could not load image");
      }
  };

  const handleDeleteIntruderSession = async (session: IntruderSession) => {
      if(!confirm("Delete this evidence log?")) return;
      try {
          await SecureVault.deleteIntruderSession({ timestamp: session.timestamp });
          setIntruderLogs(prev => prev.filter(p => p.timestamp !== session.timestamp));
          setSelectedIntruderSession(null);
      } catch(e) {
          alert("Failed to delete");
      }
  };

  // State Management Hooks
  useEffect(() => {
    if (state === 'SETTINGS') {
      setSettingsForm(prev => ({ ...prev, targetType: lockType }));
    }
  }, [state, lockType]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (isPickingFileRef.current) return;
        if (state === 'SETUP' || state === 'LOADING') return;
        setState('LOCKED');
        setPassword('');
        setIsDecoySession(false); // Always reset session type on lock
        failedAttemptsRef.current = 0; // Reset failed attempts on lock to prevent stale state issues
        
        // Ensure viewer is closed on background
        setViewingItem(null);
        setViewingUri(null);
      } else {
        if (isPickingFileRef.current) {
          setTimeout(() => { isPickingFileRef.current = false; }, 1000);
        } else {
           if (state === 'LOCKED' && bioEnabled) {
              triggerBiometricAuth();
           }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [state, bioEnabled]);

  if (state === 'LOADING') {
    return <div className="min-h-screen bg-vault-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-vault-accent border-t-transparent rounded-full animate-spin"></div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-vault-900 text-slate-100 font-sans selection:bg-vault-accent selection:text-white">
      
      {/* --- SETUP STATE --- */}
      {state === 'SETUP' && (
        <div className="min-h-screen flex items-center justify-center p-6 animate-in fade-in duration-500">
           <div className="w-full max-w-sm space-y-6">
            <div className="text-center space-y-4">
               <div className="w-20 h-20 mx-auto bg-vault-800 rounded-2xl flex items-center justify-center text-vault-accent shadow-xl border border-vault-700">
                  <Icons.Shield />
               </div>
               <h1 className="text-2xl font-bold">Welcome to SecureVault</h1>
               <p className="text-sm text-vault-400">Choose how you want to lock your files.</p>
            </div>

            {settingsForm.targetType === 'PASSWORD' && (
              <Card className="p-6 space-y-6">
                 <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setSettingsForm(s => ({...s, targetType: 'PIN', newPassword: ''}));
                        setPinStep('CREATE');
                      }}
                      className="p-3 rounded-lg border text-sm font-bold transition-all bg-vault-800 border-vault-600 text-vault-400 hover:border-vault-500 hover:text-white"
                    >
                      PIN Code (6 digits)
                    </button>
                    <button
                      className="p-3 rounded-lg border text-sm font-bold transition-all bg-vault-accent/20 border-vault-accent text-white"
                    >
                      Password (8+ chars)
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs text-vault-400 uppercase font-bold tracking-wider">Create Password</label>
                      <PasswordInput 
                        value={settingsForm.newPassword}
                        onChange={(v) => setSettingsForm(s => ({...s, newPassword: v}))}
                        placeholder="Min 8 characters"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-vault-400 uppercase font-bold tracking-wider">Confirm</label>
                      <PasswordInput 
                        value={settingsForm.confirmPassword}
                        onChange={(v) => setSettingsForm(s => ({...s, confirmPassword: v}))}
                        placeholder="Repeat to confirm"
                      />
                    </div>
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={handleSetupSubmit}
                    disabled={!settingsForm.newPassword || !settingsForm.confirmPassword || isProcessing}
                  >
                    {isProcessing ? 'Initializing Vault...' : 'Set & Continue'}
                  </Button>
              </Card>
            )}

            {settingsForm.targetType === 'PIN' && (
               <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
                  <div className="flex justify-center mb-6">
                      <div className="flex bg-vault-800 p-1 rounded-lg">
                          <button 
                            className="px-4 py-1.5 rounded bg-vault-accent text-white text-xs font-bold shadow"
                          >
                             PIN Code
                          </button>
                          <button 
                             onClick={() => setSettingsForm(s => ({...s, targetType: 'PASSWORD', newPassword: ''}))}
                             className="px-4 py-1.5 rounded text-vault-400 hover:text-white text-xs font-bold transition-colors"
                          >
                             Password
                          </button>
                      </div>
                  </div>

                  <div className="text-center">
                    <h3 className="text-lg font-medium text-white mb-6">
                      {pinStep === 'CREATE' ? 'Create your 6-digit PIN' : 'Confirm your PIN'}
                    </h3>
                    <PinDisplay value={settingsForm.newPassword} />
                    <NumberPad 
                      onPress={handleSetupPinDigit} 
                      onBackspace={handleSetupPinBackspace} 
                      disabled={isProcessing}
                    />
                  </div>
               </div>
            )}
          </div>
        </div>
      )}

      {/* --- LOCKED STATE --- */}
      {state === 'LOCKED' && (
        <div className="h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-8 animate-in zoom-in-95 duration-500">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-vault-800 to-vault-900 rounded-3xl shadow-2xl flex items-center justify-center text-vault-accent border border-vault-700 relative">
                <Icons.Shield />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">SecureVault</h1>
              <p className="text-vault-400">
                 {lockType === 'PIN' ? 'Enter PIN to Unlock' : 'Enter Password to Unlock'}
              </p>
            </div>

            {lockType === 'PASSWORD' ? (
              <div className="space-y-4">
                <PasswordInput 
                  value={password} 
                  onChange={setPassword} 
                  placeholder="Enter Password"
                  disabled={isProcessing}
                />
                
                <div className="flex gap-3">
                  <Button 
                    onClick={() => handleUnlock(password)} 
                    disabled={!password || isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? 'Verifying...' : 'Unlock Vault'}
                  </Button>
                  {bioEnabled && bioAvailable && (
                    <button 
                      onClick={triggerBiometricAuth}
                      className="px-4 rounded-lg bg-vault-800 border border-vault-700 text-vault-accent hover:bg-vault-700 hover:text-white transition-colors"
                    >
                      <Icons.Fingerprint />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                 <PinDisplay value={password} />
                 <NumberPad 
                    onPress={onPinDigit} 
                    onBackspace={onPinBackspace} 
                    disabled={isProcessing} 
                 />
                {bioEnabled && bioAvailable && (
                  <div className="flex justify-center">
                    <button 
                      onClick={triggerBiometricAuth}
                      className="p-4 rounded-full bg-vault-800 border border-vault-700 text-vault-accent hover:bg-vault-700 hover:text-white transition-all shadow-lg active:scale-95"
                    >
                      <Icons.Fingerprint />
                    </button>
                  </div>
                 )}
              </div>
            )}
            
            {error && (
              <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded animate-shake">
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- VAULT STATE --- */}
      {state === 'VAULT' && (
        <div className="pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <header className={`sticky top-0 z-40 backdrop-blur-md border-b p-4 flex items-center justify-between transition-colors ${isDecoySession ? 'bg-slate-900/80 border-slate-800' : 'bg-vault-900/80 border-vault-800'}`}>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <span className={isDecoySession ? "text-slate-500" : "text-vault-accent"}><Icons.Shield /></span>
              {isDecoySession ? 'Private Vault' : 'My Vault'}
            </h2>
            <div className="flex gap-2">
              {!isDecoySession && (
               <button 
                onClick={() => setState('SETTINGS')}
                className="p-2 text-vault-400 hover:text-white transition-colors"
              >
                <Icons.Cog />
              </button>
              )}
              <button 
                onClick={() => { setState('LOCKED'); setPassword(''); }}
                className="p-2 text-vault-400 hover:text-white transition-colors"
              >
                <Icons.Lock />
              </button>
            </div>
          </header>

          <main className="p-4 max-w-3xl mx-auto space-y-4">
            <div className={`border p-4 rounded-xl text-sm flex gap-3 ${isDecoySession ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-200'}`}>
              <div className="shrink-0 mt-0.5"><Icons.Unlock /></div>
              <p>Files imported here are encrypted and removed from public storage. They are only accessible within this app.</p>
            </div>

            <Card className="min-h-[50vh]">
              <VaultList 
                items={vaultItems} 
                onDelete={handleDelete} 
                onExport={handleExport}
                onView={handleViewFile}
              />
            </Card>
          </main>

          <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
          <FloatingActionButton onClick={() => {
            isPickingFileRef.current = true;
            fileInputRef.current?.click();
          }} />
        </div>
      )}

      {/* --- INTRUDER LOGS STATE --- */}
      {state === 'INTRUDER_LOGS' && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-300 min-h-screen">
          <header className="sticky top-0 z-40 bg-vault-900/80 backdrop-blur-md border-b border-vault-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => selectedIntruderSession ? setSelectedIntruderSession(null) : setState('SETTINGS')} 
                className="text-vault-400 hover:text-white"
              >
                <Icons.ArrowLeft />
              </button>
              <h2 className="font-bold text-lg text-red-400 flex items-center gap-2">
                <Icons.Alert /> Intruder Evidence
              </h2>
            </div>
          </header>

          <main className="p-4 max-w-lg mx-auto">
             {!selectedIntruderSession ? (
               <div className="space-y-4">
                 {intruderLogs.length === 0 ? (
                    <div className="text-center py-20 text-vault-500">
                       <Icons.Shield />
                       <p className="mt-4">No intrusion attempts detected.</p>
                    </div>
                 ) : (
                    intruderLogs.map(session => (
                      <Card key={session.id} className="p-4 flex items-center justify-between hover:bg-vault-700/50 transition cursor-pointer" onClick={() => setSelectedIntruderSession(session) }>
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center text-red-500">
                               <Icons.Camera />
                            </div>
                            <div>
                               <h4 className="font-bold text-white">{new Date(session.timestamp).toLocaleDateString()}</h4>
                               <p className="text-sm text-vault-400">{new Date(session.timestamp).toLocaleTimeString()}</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <span className="bg-vault-700 text-xs px-2 py-1 rounded-full text-white">{session.images.length} Photos</span>
                         </div>
                      </Card>
                    ))
                 )}
               </div>
             ) : (
               <div className="space-y-6">
                  <div className="flex justify-between items-center bg-vault-800 p-4 rounded-lg border border-vault-700">
                      <div>
                         <h3 className="font-bold text-white">Evidence Log</h3>
                         <p className="text-xs text-vault-400">{new Date(selectedIntruderSession.timestamp).toLocaleString()}</p>
                      </div>
                      <Button variant="danger" className="py-2 px-3 text-sm" onClick={() => handleDeleteIntruderSession(selectedIntruderSession)}>
                         Delete Log
                      </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     {selectedIntruderSession.images.map((img, idx) => (
                        <div key={img.id} className="relative aspect-square bg-black rounded-xl overflow-hidden border border-vault-700 group">
                           <button 
                             onClick={() => handleViewIntruderImage(img)}
                             className="absolute inset-0 flex items-center justify-center bg-white/5 opacity-0 group-hover:opacity-100 transition"
                           >
                             <Icons.Eye />
                           </button>
                           {/* Using a placeholder visual until clicked to simulate encrypted storage */}
                           <div className="w-full h-full flex flex-col items-center justify-center text-vault-500">
                              <Icons.Camera />
                              <span className="text-xs mt-2 uppercase font-bold">{img.originalName.includes('front') ? 'Front' : 'Back'} Cam</span>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
             )}
          </main>

          {/* Image Preview Modal */}
          <Modal isOpen={!!previewUri}>
             <div className="relative max-w-lg w-full">
                 <button onClick={() => setPreviewUri(null)} className="absolute -top-12 right-0 text-white p-2">Close</button>
                 {previewUri && <img src={previewUri} alt="Evidence" className="w-full rounded-lg shadow-2xl border border-vault-600" />}
             </div>
          </Modal>
        </div>
      )}

      {/* --- SETTINGS STATE --- */}
      {state === 'SETTINGS' && !isDecoySession && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-300">
          <header className="sticky top-0 z-40 bg-vault-900/80 backdrop-blur-md border-b border-vault-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setState('VAULT')} className="text-vault-400 hover:text-white">
                <Icons.ArrowLeft />
              </button>
              <h2 className="font-bold text-lg">Settings</h2>
            </div>
          </header>

          <main className="p-4 max-w-lg mx-auto space-y-6">
            <Card className="p-6 space-y-6">
              
              {/* Intruder Selfie Access */}
              <div className="pb-6 border-b border-vault-700">
                  <button 
                    onClick={fetchIntruderLogs}
                    className="w-full flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group"
                  >
                     <div className="flex items-center gap-3">
                        <div className="text-red-400 group-hover:scale-110 transition-transform"><Icons.Camera /></div>
                        <div className="text-left">
                           <h3 className="font-bold text-red-100">Intruder Evidence</h3>
                           <p className="text-xs text-red-300/70">View unauthorized access attempts</p>
                        </div>
                     </div>
                     <div className="text-red-400"><Icons.ArrowLeft /></div> {/* Using ArrowLeft rotated as chevron substitute */}
                  </button>
              </div>

              {/* Biometric Toggle */}
              {bioAvailable && (
                <div className="pb-6 border-b border-vault-700">
                  <div className="flex items-center justify-between">
                     <div>
                       <h3 className="text-lg font-medium text-white flex items-center gap-2">
                         <Icons.Fingerprint /> Biometric Unlock
                       </h3>
                       <p className="text-sm text-vault-400 mt-1">Use Fingerprint/FaceID to access vault</p>
                     </div>
                     <button 
                       onClick={toggleBiometrics}
                       className={`w-14 h-8 rounded-full transition-colors relative ${bioEnabled ? 'bg-vault-accent' : 'bg-vault-700'}`}
                     >
                       <div className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${bioEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                     </button>
                  </div>
                </div>
              )}

              {/* Decoy Toggle */}
              <div className="pb-6 border-b border-vault-700">
                 <div className="flex items-center justify-between">
                     <div>
                       <h3 className="text-lg font-medium text-white flex items-center gap-2">
                         <span className="text-amber-400"><Icons.Shield /></span> Coercion Defense
                       </h3>
                       <p className="text-sm text-vault-400 mt-1">Setup a Decoy Vault (Fake PIN)</p>
                     </div>
                     <button 
                       onClick={() => hasDecoy ? handleRemoveDecoy() : setShowDecoySetup(true)}
                       className={`w-14 h-8 rounded-full transition-colors relative ${hasDecoy ? 'bg-amber-500' : 'bg-vault-700'}`}
                     >
                       <div className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${hasDecoy ? 'translate-x-6' : 'translate-x-0'}`} />
                     </button>
                  </div>
                  {showDecoySetup && (
                    <div className="mt-4 p-4 bg-vault-900/50 rounded-lg border border-vault-700 space-y-3 animate-in fade-in zoom-in-95">
                      <p className="text-xs text-amber-400">Enter a secondary {lockType === 'PIN' ? 'PIN' : 'password'}. When entered on the lock screen, a fake empty vault will open.</p>
                      <div className="space-y-2">
                         <label className="text-xs text-vault-400 font-bold uppercase">Decoy {lockType}</label>
                         <input 
                           type={lockType === 'PIN' ? 'tel' : 'text'}
                           maxLength={lockType === 'PIN' ? 6 : undefined}
                           className="w-full bg-vault-800 border border-vault-700 rounded p-2 text-white text-sm"
                           placeholder={lockType === 'PIN' ? "000000" : "Safe word"}
                           value={decoyForm.pass}
                           onChange={e => setDecoyForm(s => ({...s, pass: e.target.value}))}
                         />
                      </div>
                      <div className="space-y-2">
                         <label className="text-xs text-vault-400 font-bold uppercase">Confirm</label>
                         <input 
                           type={lockType === 'PIN' ? 'tel' : 'text'}
                           maxLength={lockType === 'PIN' ? 6 : undefined}
                           className="w-full bg-vault-800 border border-vault-700 rounded p-2 text-white text-sm"
                           placeholder="Confirm"
                           value={decoyForm.confirm}
                           onChange={e => setDecoyForm(s => ({...s, confirm: e.target.value}))}
                         />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="ghost" className="flex-1 py-2 text-sm" onClick={() => setShowDecoySetup(false)}>Cancel</Button>
                        <Button className="flex-1 py-2 text-sm bg-amber-600 hover:bg-amber-700 shadow-amber-500/20" onClick={handleDecoySetup}>Enable Decoy</Button>
                      </div>
                    </div>
                  )}
              </div>

              {/* Security Type */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Security Type</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSettingsForm(s => ({...s, targetType: 'PIN'}))}
                    className={`p-4 rounded-xl border transition-all ${
                      settingsForm.targetType === 'PIN' 
                        ? 'bg-vault-accent/20 border-vault-accent text-white' 
                        : 'bg-vault-800 border-vault-600 text-vault-400 hover:border-vault-500'
                    }`}
                  >
                    <div className="font-bold mb-1">PIN Code</div>
                    <div className="text-xs opacity-70">6 Digits Only</div>
                  </button>
                  <button
                    onClick={() => setSettingsForm(s => ({...s, targetType: 'PASSWORD'}))}
                    className={`p-4 rounded-xl border transition-all ${
                      settingsForm.targetType === 'PASSWORD' 
                        ? 'bg-vault-accent/20 border-vault-accent text-white' 
                        : 'bg-vault-800 border-vault-600 text-vault-400 hover:border-vault-500'
                    }`}
                  >
                    <div className="font-bold mb-1">Password</div>
                    <div className="text-xs opacity-70">Min. 8 Characters</div>
                  </button>
                </div>
              </div>

              {/* Change Credentials */}
              <div className="space-y-4 pt-4 border-t border-vault-700">
                <h3 className="text-lg font-medium text-white">Change Credentials</h3>
                <div className="space-y-2">
                  <label className="text-xs text-vault-400 uppercase font-bold tracking-wider">Current Password</label>
                  <PasswordInput 
                    value={settingsForm.oldPassword}
                    onChange={(v) => setSettingsForm(s => ({...s, oldPassword: v}))}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-vault-400 uppercase font-bold tracking-wider">
                    New {settingsForm.targetType === 'PIN' ? 'PIN' : 'Password'}
                  </label>
                  <PasswordInput 
                    value={settingsForm.newPassword}
                    onChange={(v) => setSettingsForm(s => ({...s, newPassword: v}))}
                    placeholder={settingsForm.targetType === 'PIN' ? "Enter 6 digits" : "Min 8 chars"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-vault-400 uppercase font-bold tracking-wider">Confirm New</label>
                  <PasswordInput 
                    value={settingsForm.confirmPassword}
                    onChange={(v) => setSettingsForm(s => ({...s, confirmPassword: v}))}
                    placeholder="Repeat new password"
                  />
                </div>
                <div className="pt-4">
                  <Button 
                    className="w-full"
                    onClick={handleSettingsUpdate}
                    disabled={isProcessing || !settingsForm.oldPassword || !settingsForm.newPassword}
                  >
                    {isProcessing ? 'Updating Keys...' : 'Update & Re-encrypt Master Key'}
                  </Button>
                </div>
              </div>
            </Card>
            
            <Card className="p-6 border-red-500/20 bg-red-500/5">
              <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
                <Icons.Trash /> Danger Zone
              </h3>
              <p className="text-sm text-vault-400 mb-4">
                Resetting the vault will permanently delete all stored files and configurations. This action is irreversible.
              </p>
              <Button variant="danger" className="w-full" onClick={handleResetVaultClick}>
                Reset Vault & Wipe Data
              </Button>
            </Card>
          </main>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      <Modal isOpen={showResetConfirm}>
          <div className="bg-vault-800 p-6 rounded-2xl w-full max-w-sm space-y-6 border border-red-500/30 shadow-2xl animate-in zoom-in-95">
            <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
                    <Icons.Alert />
                </div>
                <h3 className="text-xl font-bold text-white">Reset Vault?</h3>
                <p className="text-sm text-vault-400">
                    This will permanently delete all encrypted files and settings. This action cannot be undone.
                </p>
            </div>
            
            <div className="space-y-2">
                <label className="text-xs text-vault-400 uppercase font-bold">Verify Identity</label>
                <PasswordInput 
                    value={resetVerifyPass}
                    onChange={setResetVerifyPass}
                    placeholder={`Enter current ${lockType === 'PIN' ? 'PIN' : 'Password'}`}
                />
            </div>

            <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setShowResetConfirm(false)} className="flex-1">
                    Cancel
                </Button>
                <Button variant="danger" onClick={performReset} className="flex-1" disabled={!resetVerifyPass}>
                    Wipe Everything
                </Button>
            </div>
          </div>
      </Modal>

      {/* Progress Overlay */}
      <Modal isOpen={isProcessing}>
          <div className="bg-vault-800 p-6 rounded-2xl w-full max-w-xs text-center space-y-4 shadow-2xl border border-vault-700">
            <div className="w-12 h-12 border-4 border-vault-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>
              <h3 className="font-bold text-white">Processing...</h3>
              <p className="text-xs text-vault-400 mt-1">Performing crypto operations...</p>
            </div>
            <div className="h-1 bg-vault-900 rounded-full overflow-hidden">
              <div className="h-full bg-vault-accent transition-all duration-300" style={{width: `${progress}%`}} />
            </div>
          </div>
      </Modal>

      {/* Universal File Viewer */}
      {viewingItem && (
        <FileViewer 
          item={viewingItem} 
          uri={viewingUri} 
          onClose={handleCloseViewer} 
        />
      )}
    </div>
  );
}