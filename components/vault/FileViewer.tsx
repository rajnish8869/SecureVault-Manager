import React, { useState, useEffect } from 'react';
import type { VaultItem } from '../../types';
import { Icons, getFileIcon } from '../icons/Icons';

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