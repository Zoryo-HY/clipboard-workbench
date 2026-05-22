import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X, PanelRight } from 'lucide-react';

export const Titlebar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then((fn: () => void) => fn()); };
  }, []);

  return (
    <div
      className="flex items-center w-full shrink-0 bg-surface-0 relative z-[100]"
      style={{ height: 32 }}
    >
      {/* Drag region */}
      <div
        data-tauri-drag-region
        className="flex-1 h-full flex items-center justify-center"
        style={{ cursor: 'default', WebkitAppRegion: 'drag', msAppRegion: 'drag' } as React.CSSProperties}
      >
        <span
          className="text-[12px] font-medium select-none pointer-events-none"
          style={{ color: 'var(--titlebar-text)' }}
        >
          CopyBox
        </span>
      </div>

      {/* Mini window switch */}
      <button
        onClick={() => invoke('switch_to_mini')}
        className="titlebar-btn"
        title="切换到小窗口"
      >
        <PanelRight size={14} />
      </button>

      {/* Window controls */}
      <div className="flex items-center h-full pr-1">
        <button onClick={() => invoke('minimize_window')} className="titlebar-btn">
          <Minus size={14} />
        </button>
        <button onClick={() => invoke('toggle_maximize_window')} className="titlebar-btn">
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button onClick={() => invoke('close_window')} className="titlebar-btn titlebar-btn-close">
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
