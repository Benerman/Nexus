import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './ConfirmModal.css';

const ThreadNameModal = ({ onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (name.trim()) onSubmit(name.trim());
  };

  return ReactDOM.createPortal(
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h2 className="confirm-modal-title">Start Thread</h2>
        <p className="confirm-modal-message">Give this thread a name so others know what it's about.</p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value.slice(0, 100))}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) handleSubmit(); if (e.key === 'Escape') onCancel(); }}
          placeholder="Thread name"
          maxLength={100}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--bg-primary, #1e1f22)',
            border: '1px solid var(--bg-modifier-accent, #3a3a3e)',
            borderRadius: '4px',
            color: 'var(--text-primary, #fff)',
            fontSize: '14px',
            outline: 'none',
            marginBottom: '16px',
            boxSizing: 'border-box'
          }}
        />
        <div className="confirm-modal-actions">
          <button className="confirm-modal-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="confirm-modal-btn confirm" disabled={!name.trim()} onClick={handleSubmit} style={{ opacity: name.trim() ? 1 : 0.5, cursor: name.trim() ? 'pointer' : 'not-allowed' }}>Create Thread</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ThreadNameModal;
