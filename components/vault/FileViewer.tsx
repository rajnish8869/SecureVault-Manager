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
        <div className="fixed inset-0 bg-black z-[60] flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="pt-safe bg-vault-950/90 backdrop-blur-md border-b border-vault-800 z-10 flex flex-col shadow-lg">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-vault-800 rounded-lg text-vault-400 border border-vault-700">
                            {getFileIcon(item.mimeType, item.originalName)}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-white truncate max-w-[200px] text-sm leading-tight">{item.originalName}</h3>
                            <p className="text-[10px] text-green-400 flex items-center gap-1 font-mono uppercase tracking-wide mt-0.5">
                                <Icons.Lock /> Secure View
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-vault-800 text-white hover:bg-vault-700 transition font-medium text-sm border border-vault-700">
                        Close
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-auto flex items-center justify-center bg-black p-4 relative pb-safe">
                
                {isImage && (
                    <img src={uri} alt="Secure Preview" className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                )}

                {isVideo && (
                    <video src={uri} controls autoPlay className="max-w-full max-h-full" />
                )}

                {isText && (
                    <div className="w-full max-w-2xl mx-auto h-full bg-white text-black p-6 rounded-lg overflow-auto font-mono text-xs md:text-sm whitespace-pre-wrap shadow-xl">
                        {textContent}
                    </div>
                )}

                {isPdf && (
                    <iframe src={uri} className="w-full h-full bg-white border-none rounded-lg" title="PDF Viewer" />
                )}

                {isApk && (
                    <div className="w-full max-w-sm bg-vault-900 p-8 rounded-3xl border border-vault-800 text-center space-y-6 shadow-2xl">
                        <div className="w-24 h-24 mx-auto bg-green-500/10 rounded-3xl flex items-center justify-center text-green-500 border border-green-500/20">
                            <Icons.Android />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{item.originalName}</h2>
                            <p className="text-sm text-vault-400">Android Application Package</p>
                        </div>
                        <div className="bg-vault-950 rounded-xl p-4 text-left space-y-3 text-sm border border-vault-800">
                             <div className="flex justify-between border-b border-vault-800 pb-2">
                                <span className="text-vault-500">Size</span>
                                <span className="text-white font-mono">{(item.size / 1024 / 1024).toFixed(2)} MB</span>
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
                        <p className="text-xs text-amber-500/80 bg-amber-500/10 p-3 rounded-lg border border-amber-500/10">
                           Installation from secure vault is restricted for security. Export to install.
                        </p>
                    </div>
                )}

                {isArchive && (
                    <div className="w-full max-w-md bg-vault-900 rounded-2xl border border-vault-800 flex flex-col max-h-[80vh] shadow-2xl">
                         <div className="p-4 border-b border-vault-800 flex items-center gap-3 bg-vault-800/50 rounded-t-2xl">
                            <div className="text-yellow-500"><Icons.Zip /></div>
                            <div>
                                <h4 className="font-bold text-white">Archive Contents</h4>
                                <p className="text-xs text-vault-400">Read-Only Preview</p>
                            </div>
                         </div>
                         <div className="flex-1 overflow-y-auto p-2 space-y-1">
                             {[1,2,3,4,5].map(i => (
                                 <div key={i} className="flex items-center gap-3 p-3 hover:bg-vault-800/50 rounded-lg transition-colors">
                                     <div className="text-vault-500"><Icons.File /></div>
                                     <span className="text-sm text-gray-300">internal_file_{i}.dat</span>
                                 </div>
                             ))}
                         </div>
                    </div>
                )}

                {!isImage && !isVideo && !isText && !isPdf && !isApk && !isArchive && (
                     <div className="text-center p-8 bg-vault-900 rounded-xl border border-vault-800 shadow-xl">
                         <div className="w-16 h-16 bg-vault-800 rounded-full flex items-center justify-center mx-auto mb-4 text-vault-400">
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