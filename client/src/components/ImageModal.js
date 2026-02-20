import React, { useEffect } from 'react';
import './ImageModal.css';

export default function ImageModal({ src, alt, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e) => { if (e.target.classList.contains('image-modal-overlay')) onClose(); };
    
    document.addEventListener('keydown', handleEsc);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  return (
    <div className="image-modal-overlay">
      <button className="image-modal-close" onClick={onClose}>✕</button>
      <div className="image-modal-content">
        <img src={src} alt={alt ||  'Full size image'} />
      </div>
    </div>
  );
}
