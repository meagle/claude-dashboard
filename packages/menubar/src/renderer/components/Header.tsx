import React from 'react';

const CLOCK_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
  </svg>
);

const HOME_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6-.707.707L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.063-.354-6-6zM8 2.707l5 5V13.5a.5.5 0 0 1-.5.5H10v-4a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v4H3.5a.5.5 0 0 1-.5-.5V7.707l5-5z"/>
  </svg>
);

const PIN_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
  </svg>
);

const GEAR_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
  </svg>
);

const CLOSE_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
  </svg>
);

const POPOUT_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 1h5a.5.5 0 0 0 0-1h-5A1.5 1.5 0 0 0 0 1.5v12A1.5 1.5 0 0 0 1.5 15h12a1.5 1.5 0 0 0 1.5-1.5v-5a.5.5 0 0 0-1 0v5a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z"/>
    <path d="M9.5 0a.5.5 0 0 0 0 1h4.293L5.146 9.646a.5.5 0 0 0 .708.708L14.5 1.707V6a.5.5 0 0 0 1 0V.5a.5.5 0 0 0-.5-.5H9.5z"/>
  </svg>
);

const BTN = 'bg-transparent border-none cursor-pointer text-soft text-base px-0.5 leading-none transition-colors duration-150 focus:outline-none';

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
            {POPOUT_ICON}
          </button>
        )}
        <button
          title={isHistoryOpen ? 'Back to sessions' : 'Session history'}
          className={`${BTN} ${isHistoryOpen ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onHistoryToggle}
        >
          {isHistoryOpen ? HOME_ICON : CLOCK_ICON}
        </button>
        <button
          title="Settings"
          className={`${BTN} ${isSettingsOpen ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onSettingsToggle}
        >
          {GEAR_ICON}
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
              {CLOSE_ICON}
            </button>
          </span>
        )}
      </span>
    </div>
  );
}
