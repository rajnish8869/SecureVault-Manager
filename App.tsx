import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { SecureVault } from './plugins/SecureVaultPlugin';
import { Card, Button, PasswordInput, Icons, FloatingActionButton, VaultList, Modal, NumberPad, PinDisplay, FileViewer, Toggle, SegmentedControl, DialogModal } from './components/UI';
import type { VaultItem, LockType, IntruderSession, IntruderSettings } from './types';

type AppState = 'LOADING' | 'SETUP' | 'LOCKED' | 'VAULT' | 'SETTINGS' | 'INTRUDER_LOGS';

export default function App() {
  const [state, setState] = useState<AppState>('LOADING');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Performing crypto operations...");
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
  
  // Intruder Settings UI State
  const [showIntruderSettings, setShowIntruderSettings] = useState(false);
  const [intruderConfig, setIntruderConfig] = useState<IntruderSettings>({ enabled: false, photoCount: 1, source: 'FRONT' });

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

  // Action Confirmation State (Delete/Export)
  const [confirmAction, setConfirmAction] = useState<{ type: 'DELETE' | 'EXPORT', id: string } | null>(null);
  
  // Platform check
  const isNative = Capacitor.isNativePlatform();

  // --- Dialog System State ---
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'ALERT' | 'CONFIRM' | 'PROMPT';
    title: string;
    message: string;
    variant?: 'info' | 'danger' | 'success';
    inputProps?: any;
    onConfirm: (val?: string) => void;
    onCancel: () => void;
  }>({
    isOpen: false,
    type: 'ALERT',
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    setDialog({
      isOpen: true,
      type: 'ALERT',
      title,
      message,
      onConfirm: () => { closeDialog(); if(onOk) onOk(); },
      onCancel: () => { closeDialog(); if(onOk) onOk(); }
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, variant: 'info' | 'danger' = 'info') => {
    setDialog({
      isOpen: true,
      type: 'CONFIRM',
      title,
      message,
      variant,
      onConfirm: () => { closeDialog(); onConfirm(); },
      onCancel: closeDialog
    });
  };

  const showPrompt = (title: string, message: string, onConfirm: (val: string) => void, inputType: 'text' | 'password' = 'text', placeholder = '') => {
    setDialog({
      isOpen: true,
      type: 'PROMPT',
      title,
      message,
      inputProps: { type: inputType, placeholder },
      onConfirm: (val) => { closeDialog(); if(val) onConfirm(val); },
      onCancel: closeDialog
    });
  };

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
    setProcessingStatus("Verifying credentials...");
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
          // Trigger silent capture - logic handled in plugin based on settings
          SecureVault.captureIntruderEvidence().catch(e => console.error("Intruder capture error", e));
      }

      setError(err.message || "Authentication failed");
      if(lockType === 'PIN') setPassword(''); // Reset PIN on error
    } finally {
      setIsProcessing(false);
      setProcessingStatus("Performing crypto operations...");
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
    if (!e.target.files || e.target.files.length === 0) return;
    
    // Explicitly cast to File[] to ensure TS infers the loop variable 'file' correctly as File instead of unknown/{}
    const files = Array.from(e.target.files) as File[];
    const total = files.length;
    
    setIsProcessing(true);
    setProgress(0);
    
    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < total; i++) {
        const file = files[i];
        setProcessingStatus(`Encrypting ${i + 1} of ${total}\n${file.name}`);
        
        try {
            const newItem = await SecureVault.importFile({
                fileBlob: file,
                fileName: file.name,
                password: password
            });
            setVaultItems(prev => [newItem, ...prev]);
            success++;
        } catch (err) {
            console.error(`Import failed for ${file.name}`, err);
            failed++;
        }
        
        // Update progress bar based on file count
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      // Small delay to ensure user sees completion
      await new Promise(r => setTimeout(r, 500));
      
      if (failed > 0) {
          showAlert("Import Report", `Import Completed.\nSuccess: ${success}\nFailed: ${failed}`);
      }

    } catch (err: any) {
      console.error(err);
      showAlert("Import Error", "Import process error: " + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProcessingStatus("Performing crypto operations...");
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- VIEWER HANDLER ---
  const handleViewFile = async (item: VaultItem) => {
      setIsProcessing(true);
      setProcessingStatus("Decrypting for preview...");
      try {
          // 1. Enforce Privacy (Block Screenshots)
          await SecureVault.enablePrivacyScreen({ enabled: true });
          
          // 2. Decrypt for preview
          const { uri } = await SecureVault.previewFile({ id: item.id, password });
          setViewingUri(uri);
          setViewingItem(item);

      } catch (e: any) {
          showAlert("Error", "Could not open file: " + e.message);
          SecureVault.enablePrivacyScreen({ enabled: false });
      } finally {
          setIsProcessing(false);
          setProcessingStatus("Performing crypto operations...");
      }
  };

  const handleCloseViewer = () => {
      setViewingItem(null);
      setViewingUri(null);
      // Disable strict privacy mode (allow screenshots of vault list if desired, or keep enabled globally)
      // For UX, we usually allow screenshots of the list, but not the content.
      SecureVault.enablePrivacyScreen({ enabled: false });
  };

  // Trigger Confirmation Modal
  const handleDelete = (id: string) => {
    setConfirmAction({ type: 'DELETE', id });
  };

  const handleExport = (id: string) => {
    setConfirmAction({ type: 'EXPORT', id });
  };

  // Execute Action after Confirmation
  const performConfirmedAction = async () => {
    if (!confirmAction) return;
    const { type, id } = confirmAction;
    setConfirmAction(null); // Close modal

    if (type === 'DELETE') {
        try {
            await SecureVault.deleteVaultFile({ id });
            setVaultItems(prev => prev.filter(i => i.id !== id));
        } catch (err) {
            console.error(err);
            showAlert("Error", "Delete failed");
        }
    } else if (type === 'EXPORT') {
        setIsProcessing(true);
        setProcessingStatus("Decrypting & Exporting...");
        setProgress(20);
        const timer = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 200);

        try {
            const result = await SecureVault.exportFile({ id, password });
            clearInterval(timer);
            setProgress(100);
            setTimeout(() => {
                setIsProcessing(false);
                setProcessingStatus("Performing crypto operations...");
                showAlert("Success", `File Decrypted Successfully!\nSaved to: ${result.exportedPath}`);
            }, 300);
        } catch (err: any) {
            clearInterval(timer);
            setIsProcessing(false);
            setProcessingStatus("Performing crypto operations...");
            showAlert("Export Failed", err.message);
        }
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
             showAlert("Mismatch", "PINs do not match. Try again.");
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
    setProcessingStatus("Initializing Vault...");
    try {
      await SecureVault.initializeVault({ password: newPass, type: type });
      setLockType(type);
      setSettingsForm({ oldPassword: '', newPassword: '', confirmPassword: '', targetType: 'PASSWORD' });
      setTempPin('');
      setPinStep('CREATE');
      setPassword(''); 
      setState('LOCKED');
      showAlert("Success", "Setup Complete! Please unlock your vault.");
    } catch (err: any) {
      showAlert("Setup Failed", err.message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("Performing crypto operations...");
    }
  };

  const handleSetupSubmit = async () => {
    if (settingsForm.newPassword !== settingsForm.confirmPassword) {
      showAlert("Error", "Passwords do not match");
      return;
    }
    await submitSetup(settingsForm.newPassword, settingsForm.confirmPassword, settingsForm.targetType);
  };

  const handleSettingsUpdate = async () => {
    if (settingsForm.newPassword !== settingsForm.confirmPassword) {
      showAlert("Error", "New passwords do not match");
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("Re-encrypting Vault...");
    try {
      await SecureVault.updateCredentials({
        oldPassword: settingsForm.oldPassword,
        newPassword: settingsForm.newPassword,
        newType: settingsForm.targetType
      });
      setPassword(settingsForm.newPassword);
      setLockType(settingsForm.targetType);
      showAlert("Success", "Settings updated successfully");
      setSettingsForm({ oldPassword: '', newPassword: '', confirmPassword: '', targetType: settingsForm.targetType });
      setState('VAULT');
    } catch (err: any) {
      showAlert("Update Failed", err.message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("Performing crypto operations...");
    }
  };
  
  const toggleBiometrics = async () => {
     try {
       const newStatus = !bioEnabled;
       if (newStatus && !password) {
         showAlert("Requirement", "Please re-enter your password/pin manually to enable biometrics.");
         return;
       }
       await SecureVault.setBiometricStatus({ enabled: newStatus, password: password });
       setBioEnabled(newStatus);
     } catch(e: any) {
       showAlert("Error", "Failed to change biometric settings: " + e.message);
     }
  };

  const handleResetVaultClick = () => {
     setShowResetConfirm(true);
     setResetVerifyPass('');
  };

  const performReset = async () => {
    setIsProcessing(true);
    setProcessingStatus("Wiping Data...");
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
      showAlert("Reset Complete", "Vault reset complete.");
    } catch (e: any) {
      showAlert("Reset Failed", e.message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("Performing crypto operations...");
    }
  };

  // --- DECOY HANDLERS ---
  const handleDecoySetup = async () => {
    // 1. Validate inputs
    if (!decoyForm.pass || !decoyForm.confirm) {
      showAlert("Invalid Input", "Please enter a decoy code.");
      return;
    }

    if (decoyForm.pass !== decoyForm.confirm) {
      showAlert("Mismatch", "Decoy codes do not match.");
      return;
    }

    // 2. Validate length based on type
    if (lockType === 'PIN' && decoyForm.pass.length !== 6) {
      showAlert("Invalid Input", "Decoy PIN must be exactly 6 digits.");
      return;
    }
    if (lockType === 'PASSWORD' && decoyForm.pass.length < 1) {
       showAlert("Invalid Input", "Decoy password cannot be empty.");
       return;
    }

    // 3. Process Logic with Master Key
    const processDecoy = async (master: string) => {
        setIsProcessing(true);
        setProcessingStatus("Configuring Decoy...");
        try {
            await SecureVault.setDecoyCredential({
                decoyPassword: decoyForm.pass,
                masterPassword: master
            });
            setHasDecoy(true);
            setShowDecoySetup(false);
            setDecoyForm({ pass: '', confirm: '' });
            showAlert("Success", "Decoy Vault Configured!\n\nEnter this code on the lock screen to access the fake vault.");
        } catch (e: any) {
            showAlert("Error", e.message);
        } finally {
            setIsProcessing(false);
            setProcessingStatus("Performing crypto operations...");
        }
    };

    // Check if password exists in session (it should), if not prompt
    if (password) {
        processDecoy(password);
    } else {
        showPrompt(
            "Security Check", 
            "Please confirm your MASTER password:", 
            (val) => processDecoy(val), 
            'password', 
            'Master Password'
        );
    }
  };

  const handleRemoveDecoy = async () => {
    const processRemove = async (master: string) => {
        try {
          await SecureVault.removeDecoyCredential(master);
          setHasDecoy(false);
          showAlert("Success", "Decoy removed.");
        } catch (e: any) {
          showAlert("Error", e.message);
        }
    };

    const confirmMaster = () => {
        if (password) {
            processRemove(password);
        } else {
            showPrompt(
                "Security Check", 
                "Enter MASTER password to confirm:", 
                (val) => processRemove(val), 
                'password', 
                'Master Password'
            );
        }
    };

    showConfirm(
        "Remove Decoy?", 
        "This will wipe all files inside the decoy vault.", 
        confirmMaster, 
        'danger'
    );
  };

  // --- INTRUDER HANDLERS ---
  const fetchIntruderLogs = async () => {
      const logs = await SecureVault.getIntruderLogs();
      setIntruderLogs(logs);
      setState('INTRUDER_LOGS');
  };
  
  const openIntruderSettings = async () => {
     const settings = await SecureVault.getIntruderSettings();
     setIntruderConfig(settings);
     setShowIntruderSettings(true);
  };
  
  const saveIntruderSettings = async () => {
     try {
       await SecureVault.setIntruderSettings(intruderConfig);
       setShowIntruderSettings(false);
     } catch (e) {
       showAlert("Error", "Failed to save settings");
     }
  };
  
  const checkCameraPermission = async () => {
      const { granted } = await SecureVault.checkCameraPermission();
      if (granted) {
          showAlert("Permission Status", "Camera Permission Granted");
      } else {
          showAlert("Permission Status", "Camera Permission Denied or Unavailable. Please check device settings.");
      }
  };

  const handleViewIntruderImage = async (img: VaultItem) => {
      try {
          // Decrypt purely for preview
          const { uri } = await SecureVault.previewFile({ id: img.id, password });
          setPreviewUri(uri);
      } catch (e) {
          showAlert("Error", "Could not load image");
      }
  };

  const handleDeleteIntruderSession = async (session: IntruderSession) => {
      showConfirm(
          "Delete Log", 
          "Delete this evidence log?", 
          async () => {
            try {
                await SecureVault.deleteIntruderSession({ timestamp: session.timestamp });
                setIntruderLogs(prev => prev.filter(p => p.timestamp !== session.timestamp));
                setSelectedIntruderSession(null);
            } catch(e) {
                showAlert("Error", "Failed to delete");
            }
          }, 
          'danger'
      );
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

          <input type="file" multiple ref={fileInputRef} onChange={handleImport} className="hidden" />
          <FloatingActionButton onClick={() => {
            isPickingFileRef.current = true;
            fileInputRef.current?.click();
          }} />
        </div>
      )}

      {/* --- INTRUDER LOGS STATE --- */}
      {state === 'INTRUDER_LOGS' && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-300 min-h-screen bg-vault-900">
          <header className="sticky top-0 z-40 bg-vault-900/90 backdrop-blur-xl border-b border-vault-800 p-4 flex items-center justify-between shadow-lg shadow-black/20">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => selectedIntruderSession ? setSelectedIntruderSession(null) : setState('SETTINGS')} 
                className="p-2 -ml-2 rounded-full text-vault-400 hover:text-white hover:bg-vault-800 transition-colors"
              >
                <Icons.ArrowLeft />
              </button>
              <div>
                  <h2 className="font-bold text-lg text-white flex items-center gap-2">
                    Evidence Logs
                  </h2>
                  <p className="text-xs text-red-400 font-medium tracking-wide uppercase">Intruder Detection System</p>
              </div>
            </div>
            {selectedIntruderSession && (
                <div className="text-xs text-vault-500 font-mono hidden sm:block">
                    Session ID: {selectedIntruderSession.id}
                </div>
            )}
          </header>

          <main className="p-4 max-w-2xl mx-auto min-h-[calc(100vh-80px)]">
             {!selectedIntruderSession ? (
               <div className="space-y-6">
                 {intruderLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 py-12 animate-in zoom-in-95 duration-500">
                       <div className="relative group cursor-default">
                          <div className="absolute inset-0 bg-green-500/10 blur-3xl rounded-full group-hover:bg-green-500/20 transition-colors duration-500"></div>
                          <div className="relative w-32 h-32 bg-gradient-to-br from-vault-800 to-vault-900 rounded-[2rem] border border-vault-700 flex items-center justify-center text-green-500 shadow-2xl shadow-black/50 group-hover:scale-105 transition-transform duration-300">
                              <div className="scale-150"><Icons.Shield /></div>
                              <div className="absolute -bottom-2 -right-2 bg-green-500 text-vault-900 rounded-full p-1.5 border-[6px] border-vault-900 shadow-sm">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                              </div>
                          </div>
                       </div>
                       <div className="space-y-3 max-w-sm mx-auto">
                           <h3 className="text-2xl font-bold text-white">No Intruders Detected</h3>
                           <p className="text-vault-400 text-sm leading-relaxed">
                             Your vault is secure. The intruder detection system has not recorded any unauthorized access attempts or failed login sequences.
                           </p>
                       </div>
                       <Button variant="outline" onClick={() => setState('SETTINGS')} className="mt-4 border-vault-700 bg-vault-800/50 hover:bg-vault-800">
                          Configure Sensitivity
                       </Button>
                    </div>
                 ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2 pb-2 border-b border-vault-800">
                            <h3 className="text-xs font-bold text-vault-400 uppercase tracking-widest">Recent Activity</h3>
                            <span className="text-xs font-mono text-vault-500">{intruderLogs.length} EVENTS</span>
                        </div>
                        {intruderLogs.map((session) => (
                            <div 
                                key={session.id}
                                onClick={() => setSelectedIntruderSession(session)}
                                className="group relative bg-vault-800/50 hover:bg-vault-800 rounded-xl border border-vault-700/50 hover:border-red-500/30 p-4 transition-all duration-200 cursor-pointer overflow-hidden active:scale-[0.99]"
                            >
                                {/* Active Indicator Strip */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500 to-red-600 opacity-60 group-hover:opacity-100 transition-opacity"></div>
                                
                                <div className="flex items-center gap-4 pl-2">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-lg bg-vault-900 border border-vault-700 flex items-center justify-center text-red-500/80 group-hover:text-red-400 group-hover:border-red-500/20 transition-all shadow-inner">
                                            <Icons.Camera />
                                        </div>
                                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-md border-2 border-vault-800 shadow-sm">
                                            {session.images.length}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-bold text-slate-200 text-sm truncate group-hover:text-white transition-colors">Unauthorized Access</h4>
                                            <span className="text-[10px] text-vault-500 group-hover:text-vault-400 bg-vault-900/50 px-2 py-0.5 rounded-full font-mono">
                                                {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-vault-500 group-hover:text-vault-400 truncate flex items-center gap-2">
                                            <span>{new Date(session.timestamp).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                                        </p>
                                    </div>

                                    <div className="text-vault-600 group-hover:text-red-400 transition-colors transform group-hover:translate-x-1 duration-200 rotate-180">
                                        <Icons.ArrowLeft />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                 )}
               </div>
             ) : (
               <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-300">
                  {/* Summary Card */}
                  <div className="bg-gradient-to-br from-vault-800 to-vault-900 rounded-2xl p-6 border border-vault-700/50 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity text-red-500 transform translate-x-4 -translate-y-4 scale-150">
                          <Icons.Shield />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                          <div className="space-y-1">
                             <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                </span>
                                Intrusion Detected
                             </h2>
                             <div className="flex items-center gap-2 text-sm text-vault-400 font-mono">
                                <span className="bg-vault-950/50 px-2 py-0.5 rounded text-vault-300 border border-vault-700/50">
                                    {new Date(selectedIntruderSession.timestamp).toLocaleDateString()}
                                </span>
                                <span className="text-vault-600">at</span>
                                <span className="text-white">
                                    {new Date(selectedIntruderSession.timestamp).toLocaleTimeString()}
                                </span>
                             </div>
                          </div>
                          
                          <Button 
                            variant="danger" 
                            className="w-full sm:w-auto py-2 px-4 text-xs font-bold tracking-wide shadow-lg shadow-red-900/20 border border-red-500/20" 
                            onClick={() => handleDeleteIntruderSession(selectedIntruderSession)}
                          >
                             DELETE LOG
                          </Button>
                      </div>
                  </div>
                  
                  {/* Evidence Grid */}
                  <div>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <h3 className="text-sm font-bold text-vault-400 uppercase tracking-widest flex items-center gap-2">
                            <Icons.Camera /> Captured Evidence
                        </h3>
                        <span className="text-xs bg-vault-800 text-vault-500 px-2 py-1 rounded-full border border-vault-700">
                            {selectedIntruderSession.images.length} FILES
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {selectedIntruderSession.images.map((img, idx) => (
                            <div 
                                key={img.id} 
                                className="group relative aspect-[3/4] bg-vault-950 rounded-xl overflow-hidden border border-vault-800 shadow-lg cursor-zoom-in hover:border-vault-600 transition-all duration-300 hover:shadow-2xl hover:shadow-black/50"
                                onClick={() => handleViewIntruderImage(img)}
                            >
                                {/* Static Background/Placeholder */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-vault-700 group-hover:text-vault-600 transition-colors">
                                    <div className="p-4 rounded-full bg-vault-900 border border-vault-800 mb-3 group-hover:scale-110 transition-transform duration-300">
                                        <Icons.Camera />
                                    </div>
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-vault-500">
                                            {img.originalName.includes('front') ? 'Front Cam' : (img.originalName.includes('back') ? 'Back Cam' : 'Camera ' + (idx+1))}
                                        </span>
                                        <span className="text-[9px] font-mono text-vault-600 bg-vault-900/50 px-1.5 rounded">ENCRYPTED</span>
                                    </div>
                                </div>
                                
                                {/* Hover Action Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-vault-900/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                    <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                        <p className="text-white text-xs font-bold flex items-center gap-2 mb-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Decrypt & View
                                        </p>
                                        <p className="text-[10px] text-vault-400">Tap to unlock preview</p>
                                    </div>
                                </div>
                                
                                {/* Corner Index */}
                                <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-mono text-white/90 border border-white/10 shadow-sm">
                                    #{idx + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
               </div>
             )}
          </main>

          {/* Image Preview Modal */}
          <Modal isOpen={!!previewUri}>
             <div className="relative max-w-lg w-full bg-transparent shadow-none border-none p-0 flex flex-col items-center">
                 <button 
                    onClick={() => setPreviewUri(null)} 
                    className="absolute -top-12 right-0 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-sm transition-all"
                >
                    <Icons.X />
                </button>
                 {previewUri && (
                    <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-vault-600/50 bg-black">
                        <img src={previewUri} alt="Evidence" className="max-h-[80vh] w-auto object-contain" />
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                            <p className="text-white text-xs font-mono text-center opacity-70">CONFIDENTIAL EVIDENCE - DO NOT SHARE</p>
                        </div>
                    </div>
                 )}
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
              
              {/* Intruder Settings Entry */}
              <div className="pb-6 border-b border-vault-700">
                   <div className="flex items-center justify-between mb-4">
                       <h3 className="text-lg font-medium text-white flex items-center gap-2">
                         <span className="text-red-400"><Icons.Camera /></span> Intruder Detection
                       </h3>
                       <button onClick={openIntruderSettings} className="p-2 rounded-full hover:bg-vault-700 text-vault-400 transition">
                           <Icons.Cog />
                       </button>
                   </div>
                   <button 
                    onClick={fetchIntruderLogs}
                    className="w-full flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group"
                  >
                     <div className="flex items-center gap-3">
                        <div className="text-red-400 group-hover:scale-110 transition-transform"><Icons.Alert /></div>
                        <div className="text-left">
                           <h3 className="font-bold text-red-100">View Evidence Logs</h3>
                           <p className="text-xs text-red-300/70">Check unauthorized access attempts</p>
                        </div>
                     </div>
                     <div className="text-red-400 rotate-180"><Icons.ArrowLeft /></div> 
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
                     <Toggle checked={bioEnabled} onChange={toggleBiometrics} />
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
                     <Toggle checked={hasDecoy} onChange={() => hasDecoy ? handleRemoveDecoy() : setShowDecoySetup(true)} />
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
      
      {/* Intruder Settings Modal */}
      <Modal isOpen={showIntruderSettings}>
          <div className="bg-vault-800 p-6 rounded-2xl w-full max-w-sm space-y-6 border border-vault-700 shadow-2xl animate-in zoom-in-95 relative">
              <button 
                  onClick={() => setShowIntruderSettings(false)}
                  className="absolute top-4 right-4 text-vault-400 hover:text-white"
              >
                  <Icons.X />
              </button>
              
              <div className="text-center">
                  <h3 className="text-xl font-bold text-white">Intruder Detection</h3>
                  <p className="text-sm text-vault-400 mt-1">Silent selfie on failed attempts</p>
              </div>

              <div className="space-y-6">
                  {/* Enable Switch */}
                  <div className="flex items-center justify-between bg-vault-900/50 p-4 rounded-xl border border-vault-700">
                      <span className="font-medium text-white">Enabled</span>
                      <Toggle 
                          checked={intruderConfig.enabled} 
                          onChange={e => setIntruderConfig(c => ({...c, enabled: e}))} 
                      />
                  </div>

                  {/* Photo Count */}
                  <div className="space-y-3">
                      <label className="text-xs text-vault-400 uppercase font-bold">Photos to Capture</label>
                      <SegmentedControl 
                          options={[
                              { label: '1', value: 1 },
                              { label: '2', value: 2 },
                              { label: '3', value: 3 },
                          ]}
                          value={intruderConfig.photoCount}
                          onChange={v => setIntruderConfig(c => ({...c, photoCount: v}))}
                          disabled={!intruderConfig.enabled}
                      />
                  </div>

                  {/* Camera Source */}
                  <div className="space-y-3">
                      <label className="text-xs text-vault-400 uppercase font-bold">Camera Source</label>
                      <SegmentedControl 
                          options={[
                              { label: 'FRONT', value: 'FRONT' },
                              { label: 'BACK', value: 'BACK' },
                              { label: 'BOTH', value: 'BOTH' },
                          ]}
                          value={intruderConfig.source}
                          onChange={v => setIntruderConfig(c => ({...c, source: v}))}
                          // Disable Back/Both on Web (non-native) for simplicity/reliability
                          disabled={!intruderConfig.enabled || (!isNative && intruderConfig.source !== 'FRONT')} 
                      />
                      {!isNative && (
                          <p className="text-xs text-amber-500/80 mt-1">
                              * Multi-camera support is limited to Native App
                          </p>
                      )}
                  </div>
              </div>

              <div className="pt-2 space-y-3">
                 <Button 
                   variant="outline" 
                   className="w-full text-sm"
                   onClick={checkCameraPermission}
                 >
                   <Icons.Camera /> Check Permission
                 </Button>
                 
                 <Button 
                   className="w-full"
                   onClick={saveIntruderSettings}
                 >
                   Save Settings
                 </Button>
              </div>
          </div>
      </Modal>

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

      {/* Confirmation Action Modal */}
      <Modal isOpen={!!confirmAction}>
        <div className="bg-vault-800 p-6 rounded-2xl w-full max-w-sm space-y-6 border border-vault-700 shadow-2xl animate-in zoom-in-95">
          <div className="text-center space-y-3">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              confirmAction?.type === 'DELETE' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'
            }`}>
              {confirmAction?.type === 'DELETE' ? <Icons.Trash /> : <Icons.Download />}
            </div>
            <h3 className="text-xl font-bold text-white">
              {confirmAction?.type === 'DELETE' ? 'Delete File?' : 'Export File?'}
            </h3>
            <p className="text-sm text-vault-400 px-4">
              {confirmAction?.type === 'DELETE' 
                ? 'This file will be permanently removed from the vault. This action cannot be undone.'
                : 'The file will be decrypted and saved to your device Downloads folder.'}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button 
              variant={confirmAction?.type === 'DELETE' ? 'danger' : 'primary'} 
              className="flex-1" 
              onClick={performConfirmedAction}
            >
              {confirmAction?.type === 'DELETE' ? 'Delete Forever' : 'Decrypt & Save'}
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
              <p className="text-xs text-vault-400 mt-1 whitespace-pre-line">{processingStatus}</p>
            </div>
            <div className="h-1 bg-vault-900 rounded-full overflow-hidden">
              <div className="h-full bg-vault-accent transition-all duration-300" style={{width: `${progress}%`}} />
            </div>
          </div>
      </Modal>

      {/* Global Dialog Overlay */}
      <DialogModal 
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
        inputProps={dialog.inputProps}
      />

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