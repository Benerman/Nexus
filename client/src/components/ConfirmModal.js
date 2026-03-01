import React from 'react';
import ReactDOM from 'react-dom';
import './ConfirmModal.css';

const ConfirmModal = ({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger }) => {
  return ReactDOM.createPortal(
    <div className="confirm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h2 className="confirm-modal-title">{title || 'Are you sure?'}</h2>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="confirm-modal-btn cancel" onClick={onCancel}>
            {cancelLabel || 'Cancel'}
          </button>
          <button className={`confirm-modal-btn ${danger ? 'danger' : 'confirm'}`} onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
