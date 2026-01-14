import React from 'react';
import { Icons } from '../icons/Icons';

export const FloatingActionButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button 
    onClick={onClick}
    className="fixed bottom-8 right-8 w-14 h-14 bg-vault-accent rounded-full shadow-2xl shadow-blue-500/40 flex items-center justify-center text-white hover:bg-blue-500 active:scale-90 transition-all z-50"
  >
    <Icons.Plus />
  </button>
);