import React, { useState, useEffect } from 'react';
import type { VaultItem } from '../types';

// --- Icons ---
export const Icons = {
  Lock: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
  Unlock: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>,
  Shield: () => <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Plus: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  File: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Eye: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  EyeOff: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>,
  Download: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  Cog: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  ArrowLeft: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  Backspace: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>,
  Fingerprint: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.131A8 8 0 008 8mc0 .187.081.313.1.471a9 9 0 0011.012 2.162M21 21c0-1.556-2.05-3.5-3.5-3.5" /></svg>,
  Camera: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Alert: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  // New File Types
  Video: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Image: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  Zip: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
  Android: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Text: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
};

// --- Helper for File Types ---
const getFileIcon = (mime: string, name: string) => {
  if (mime.startsWith('image/')) return <Icons.Image />;
  if (mime.startsWith('video/')) return <Icons.Video />;
  if (mime.includes('pdf')) return <Icons.File />;
  if (mime.includes('zip') || mime.includes('rar')) return <Icons.Zip />;
  if (name.endsWith('.apk')) return <Icons.Android />;
  if (mime.startsWith('text/') || mime.includes('json')) return <Icons.Text />;
  return <Icons.File />;
};

// --- Components ---

export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-vault-800 rounded-xl border border-vault-700 shadow-xl overflow-hidden ${className}`}>
    {children}
  </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost' }> = ({ 
  children, variant = 'primary', className = '', ...props 
}) => {
  const baseStyle = "px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-vault-accent hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20",
    danger: "bg-vault-danger hover:bg-red-600 text-white shadow-lg shadow-red-500/20",
    ghost: "bg-transparent hover:bg-vault-700 text-vault-400 hover:text-white"
  };
  
  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const FloatingActionButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button 
    onClick={onClick}
    className="fixed bottom-8 right-8 w-14 h-14 bg-vault-accent rounded-full shadow-2xl shadow-blue-500/40 flex items-center justify-center text-white hover:bg-blue-500 active:scale-90 transition-all z-50"
  >
    <Icons.Plus />
  </button>
);

export const PasswordInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, onChange, placeholder = "Enter Password", disabled }) => {
  const [show, setShow] = React.useState(false);
  
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-vault-900 border border-vault-700 rounded-lg px-4 py-3 pr-12 text-white placeholder-vault-500 focus:outline-none focus:border-vault-accent focus:ring-1 focus:ring-vault-accent transition-all disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-500 hover:text-white p-1"
      >
        {show ? <Icons.EyeOff /> : <Icons.Eye />}
      </button>
    </div>
  );
};

export const PinDisplay: React.FC<{ value: string; length?: number }> = ({ value, length = 6 }) => {
  return (
    <div className="flex justify-center gap-4 mb-8">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full transition-all duration-300 ${
            i < value.length 
              ? 'bg-vault-accent scale-110 shadow-lg shadow-blue-500/50' 
              : 'bg-vault-700 scale-100'
          }`}
        />
      ))}
    </div>
  );
};

export const NumberPad: React.FC<{ 
  onPress: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}> = ({ onPress, onBackspace, disabled }) => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
      {digits.map(d => (
        <button
          key={d}
          onClick={() => onPress(d)}
          disabled={disabled}
          className="w-20 h-20 rounded-full bg-vault-800 border border-vault-700 hover:bg-vault-700 active:bg-vault-accent active:border-vault-accent transition-all duration-150 flex items-center justify-center text-2xl font-semibold text-white shadow-lg disabled:opacity-50"
        >
          {d}
        </button>
      ))}
      <div />
      <button
          onClick={() => onPress('0')}
          disabled={disabled}
          className="w-20 h-20 rounded-full bg-vault-800 border border-vault-700 hover:bg-vault-700 active:bg-vault-accent active:border-vault-accent transition-all duration-150 flex items-center justify-center text-2xl font-semibold text-white shadow-lg disabled:opacity-50"
        >
          0
      </button>
      <button
          onClick={onBackspace}
          disabled={disabled}
          className="w-20 h-20 rounded-full hover:bg-vault-800/50 active:bg-vault-700 transition-all flex items-center justify-center text-vault-400 disabled:opacity-50"
        >
          <Icons.Backspace />
      </button>
    </div>
  );
};

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
        <div 
          key={item.id} 
          className="p-4 hover:bg-vault-700/30 transition-colors flex items-center justify-between group cursor-pointer"
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
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
             <button 
              onClick={() => onExport(item.id)}
              className="p-2 text-vault-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
              title="Decrypt & Export"
            >
              <Icons.Download />
            </button>
            <button 
              onClick={() => onDelete(item.id)}
              className="p-2 text-vault-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
              title="Delete Permanently"
            >
              <Icons.Trash />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export const Modal: React.FC<{ children: React.ReactNode; isOpen: boolean }> = ({ children, isOpen }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {children}
    </div>
  );
};

// --- Secure File Viewer ---
export const FileViewer: React.FC<{ 
    item: VaultItem; 
    uri: string | null; 
    onClose: () => void; 
}> = ({ item, uri, onClose }) => {
    
    // Type helpers
    const isImage = item.mimeType.startsWith('image/');
    const isVideo = item.mimeType.startsWith('video/');
    const isPdf = item.mimeType.includes('pdf');
    const isText = item.mimeType.startsWith('text/') || item.mimeType.includes('json');
    const isArchive = item.mimeType.includes('zip') || item.mimeType.includes('rar');
    const isApk = item.originalName.endsWith('.apk');

    // Text Content State
    const [textContent, setTextContent] = useState<string>('Loading...');

    useEffect(() => {
        if (isText && uri) {
            fetch(uri)
                .then(r => r.text())
                .then(setTextContent)
                .catch(() => setTextContent("Error loading content"));
        }
    }, [isText, uri]);

    if (!uri) return null;

    return (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col animate-in slide-in-from-bottom-10 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-vault-900 border-b border-vault-800 z-10">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-vault-800 rounded-lg text-vault-400">
                        {getFileIcon(item.mimeType, item.originalName)}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-white truncate max-w-[200px]">{item.originalName}</h3>
                        <p className="text-xs text-green-400 flex items-center gap-1">
                            <Icons.Lock /> Secure View
                        </p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-full bg-vault-800 text-white hover:bg-vault-700 transition">
                    Close
                </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-auto flex items-center justify-center bg-black/90 p-2 relative">
                
                {/* 1. Image Viewer */}
                {isImage && (
                    <img src={uri} alt="Secure Preview" className="max-w-full max-h-full object-contain shadow-2xl" />
                )}

                {/* 2. Video Viewer */}
                {isVideo && (
                    <video src={uri} controls autoPlay className="max-w-full max-h-full" />
                )}

                {/* 3. Text Viewer */}
                {isText && (
                    <div className="w-full h-full bg-white text-black p-4 rounded overflow-auto font-mono text-sm whitespace-pre-wrap">
                        {textContent}
                    </div>
                )}

                {/* 4. PDF Viewer */}
                {isPdf && (
                    <iframe src={uri} className="w-full h-full bg-white border-none rounded" title="PDF Viewer" />
                )}

                {/* 5. APK Metadata Viewer */}
                {isApk && (
                    <div className="w-full max-w-sm bg-vault-800 p-6 rounded-2xl border border-vault-700 text-center space-y-6">
                        <div className="w-24 h-24 mx-auto bg-green-500/20 rounded-2xl flex items-center justify-center text-green-500">
                            <Icons.Android />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{item.originalName}</h2>
                            <p className="text-sm text-vault-400">Android Application Package</p>
                        </div>
                        <div className="bg-vault-900 rounded-xl p-4 text-left space-y-3 text-sm border border-vault-700">
                             <div className="flex justify-between border-b border-vault-800 pb-2">
                                <span className="text-vault-500">Size</span>
                                <span className="text-white">{(item.size / 1024 / 1024).toFixed(2)} MB</span>
                             </div>
                             <div className="flex justify-between border-b border-vault-800 pb-2">
                                <span className="text-vault-500">Package</span>
                                <span className="text-white truncate max-w-[150px]">com.android.app</span>
                             </div>
                             <div className="flex justify-between">
                                <span className="text-vault-500">Version</span>
                                <span className="text-white">1.0.0 (Build 1)</span>
                             </div>
                        </div>
                        <p className="text-xs text-amber-500/80 bg-amber-500/10 p-3 rounded-lg">
                           Installation from secure vault is restricted for security. Export to install.
                        </p>
                    </div>
                )}

                {/* 6. Archive Viewer (List Mock) */}
                {isArchive && (
                    <div className="w-full max-w-md bg-vault-800 rounded-2xl border border-vault-700 flex flex-col max-h-[80vh]">
                         <div className="p-4 border-b border-vault-700 flex items-center gap-3">
                            <div className="text-yellow-500"><Icons.Zip /></div>
                            <div>
                                <h4 className="font-bold text-white">Archive Contents</h4>
                                <p className="text-xs text-vault-400">Read-Only Preview</p>
                            </div>
                         </div>
                         <div className="flex-1 overflow-y-auto p-2 space-y-1">
                             {/* Mock File List */}
                             {[1,2,3,4,5].map(i => (
                                 <div key={i} className="flex items-center gap-3 p-3 hover:bg-vault-700/50 rounded-lg">
                                     <div className="text-vault-500"><Icons.File /></div>
                                     <span className="text-sm text-gray-300">internal_file_{i}.dat</span>
                                 </div>
                             ))}
                         </div>
                    </div>
                )}

                {/* Fallback */}
                {!isImage && !isVideo && !isText && !isPdf && !isApk && !isArchive && (
                     <div className="text-center p-8 bg-vault-800 rounded-xl border border-vault-700">
                         <div className="w-16 h-16 bg-vault-700 rounded-full flex items-center justify-center mx-auto mb-4 text-vault-400">
                            <Icons.Alert />
                         </div>
                         <h3 className="text-white font-bold mb-2">Preview Not Supported</h3>
                         <p className="text-vault-400 text-sm max-w-xs mx-auto">
                            This file type cannot be opened safely inside the vault. Please export it to view externally.
                         </p>
                     </div>
                )}
            </div>
        </div>
    );
};