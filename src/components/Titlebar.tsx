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

  const btnBase: React.CSSProperties = {
    width: 36,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    borderRadius: 4,
    transition: 'background 0.15s, color 0.15s',
  };

  return (
    <div
      style={{
        height: '32px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        background: 'transparent',
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Drag region */}
      <div
        data-tauri-drag-region
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          WebkitAppRegion: 'drag',
          msAppRegion: 'drag',
          cursor: 'default',
        } as React.CSSProperties}
      >
        <span style={{ color: '#888', fontSize: '12px', userSelect: 'none', pointerEvents: 'none' }}>
          Clipboard Workbench
        </span>
      </div>

      {/* Mini window switch */}
      <button
        onClick={() => invoke('switch_to_mini')}
        style={btnBase}
        title="切换到小窗口"
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.color = '#a78bfa'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
      >
        <PanelRight size={14} />
      </button>

      {/* Window controls — using invoke for reliability */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: 4 }}>
        <button
          onClick={() => { console.log('minimize clicked'); invoke('minimize_window'); }}
          style={btnBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#ccc'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => { console.log('maximize clicked'); invoke('toggle_maximize_window'); }}
          style={btnBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#ccc'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={() => { console.log('close clicked'); invoke('close_window'); }}
          style={btnBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
