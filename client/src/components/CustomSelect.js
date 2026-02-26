import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CustomSelect.css';

export default function CustomSelect({ value, onChange, options = [], placeholder = 'Select...', className = '', style }) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);

  const selectedOption = options.find(o => String(o.value) === String(value));
  const displayText = selectedOption ? selectedOption.label : null;

  const positionDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownMaxHeight = 300;
    const openAbove = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

    const pos = {
      left: rect.left,
      width: rect.width,
    };

    if (openAbove) {
      pos.bottom = window.innerHeight - rect.top + 4;
    } else {
      pos.top = rect.bottom + 4;
    }

    setDropdownStyle(pos);
  }, []);

  useEffect(() => {
    if (!open) return;
    positionDropdown();
  }, [open, positionDropdown]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setOpen(false);
  };

  return (
    <div className={`custom-select ${className}`} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className={`custom-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className={displayText ? 'custom-select-text' : 'custom-select-text custom-select-placeholder'}>
          {displayText || placeholder}
        </span>
        <span className="custom-select-chevron">▼</span>
      </button>

      {open && (
        <>
          <div className="custom-select-overlay" onClick={() => setOpen(false)} />
          <div className="custom-select-dropdown" style={dropdownStyle}>
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`custom-select-option${String(opt.value) === String(value) ? ' selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
