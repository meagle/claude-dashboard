import React from 'react';

const PIN_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
  </svg>
);

const BTN = 'bg-transparent border-none cursor-pointer text-soft text-base px-0.5 leading-none transition-colors duration-150';

interface HeaderProps {
  isDetached: boolean;
  isSettingsOpen: boolean;
  isHistoryOpen: boolean;
  alwaysOnTop: boolean;
  onSettingsToggle: () => void;
  onHistoryToggle: () => void;
  onPopout: () => void;
  onPinToggle: () => void;
  onClose: () => void;
}

export function Header({
  isDetached,
  isSettingsOpen,
  isHistoryOpen,
  alwaysOnTop,
  onSettingsToggle,
  onHistoryToggle,
  onPopout,
  onPinToggle,
  onClose,
}: HeaderProps) {
  return (
    <div id="header" className="flex justify-between items-center px-3 pb-1.5 border-b border-line shrink-0">
      <span className="font-bold text-bright text-[13px]">🤖 Claude Dashboard</span>
      <span className="flex items-center gap-2.5">
        {!isDetached && (
          <button
            title="Open as standalone panel"
            className={`${BTN} hover:text-bright`}
            onClick={onPopout}
          >
            ⧉
          </button>
        )}
        <button
          title="Session history"
          className={`${BTN} ${isHistoryOpen ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onHistoryToggle}
        >
          🕐
        </button>
        <button
          title="Settings"
          className={`${BTN} ${isSettingsOpen ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onSettingsToggle}
        >
          ⚙
        </button>
        {isDetached && (
          <span className="flex items-center gap-2">
            <button
              title={alwaysOnTop ? 'Always on top (click to disable)' : 'Always on top (click to enable)'}
              className={`${BTN} ${alwaysOnTop ? 'text-[#cc4444]' : 'text-faint hover:text-[#cc4444]'}`}
              onClick={onPinToggle}
            >
              {PIN_ICON}
            </button>
            <button
              title="Close panel"
              className={`${BTN} hover:text-[#e06060]`}
              onClick={onClose}
            >
              ✕
            </button>
          </span>
        )}
      </span>
    </div>
  );
}
