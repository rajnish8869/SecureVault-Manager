import React, { useState, useEffect } from 'react';
import { Button, PasswordInput, PinDisplay, NumberPad, Icons } from '../components/UI';
import type { LockType } from '../types';

interface LockScreenProps {
  lockType: LockType;
  onUnlock: (password: string) => void;
  onBiometricAuth?: () => void;
  error: string | null;
  isProcessing: boolean;
  bioEnabled: boolean;
  bioAvailable: boolean;
  clearError: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ 
    lockType, onUnlock, onBiometricAuth, error, isProcessing, bioEnabled, bioAvailable, clearError
}) => {
  const [input, setInput] = useState('');

  // Clear input when error occurs (if PIN) or reset
  useEffect(() => {
      if(error && lockType === 'PIN') setInput('');
  }, [error, lockType]);

  const handlePinDigit = (d: string) => {
      if(isProcessing) return;
      clearError();
      if (input.length < 6) {
          const newVal = input + d;
          setInput(newVal);
          if (newVal.length === 6) {
              onUnlock(newVal);
          }
      }
  };

  const handleBackspace = () => {
      setInput(prev => prev.slice(0, -1));
      clearError();
  };

  return (
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
                  value={input} 
                  onChange={(v) => { setInput(v); clearError(); }} 
                  placeholder="Enter Password"
                  disabled={isProcessing}
                />
                <div className="flex gap-3">
                  <Button onClick={() => onUnlock(input)} disabled={!input || isProcessing} className="w-full">
                    {isProcessing ? 'Verifying...' : 'Unlock Vault'}
                  </Button>
                  {bioEnabled && bioAvailable && onBiometricAuth && (
                    <button onClick={onBiometricAuth} className="px-4 rounded-lg bg-vault-800 border border-vault-700 text-vault-accent hover:bg-vault-700 hover:text-white transition-colors">
                      <Icons.Fingerprint />
                    </button>
                  )}
                </div>
             </div>
        ) : (
            <div className="space-y-6">
                 <PinDisplay value={input} />
                 <NumberPad onPress={handlePinDigit} onBackspace={handleBackspace} disabled={isProcessing} />
                 {bioEnabled && bioAvailable && onBiometricAuth && (
                  <div className="flex justify-center">
                    <button onClick={onBiometricAuth} className="p-4 rounded-full bg-vault-800 border border-vault-700 text-vault-accent hover:bg-vault-700 hover:text-white transition-all shadow-lg active:scale-95">
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
  );
};