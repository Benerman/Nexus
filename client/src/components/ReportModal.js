import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const REPORT_TYPES = [
  { value: 'spam', label: 'Spam', description: 'Unwanted or repetitive content' },
  { value: 'harassment', label: 'Harassment', description: 'Targeted harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate Content', description: 'NSFW, violent, or offensive material' },
  { value: 'other', label: 'Other', description: 'Something else not listed above' },
];

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0, 0, 0, 0.7)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 10001,
};

const modalStyle = {
  background: 'var(--bg-secondary)', borderRadius: 8, width: '90%', maxWidth: 440,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)', padding: 24,
};

const ReportModal = ({ target, onSubmit, onClose }) => {
  const [reportType, setReportType] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!reportType) return;
    setSubmitting(true);
    onSubmit({ reportType, description });
  };

  const isUser = !!target?.username;
  const title = target?.messagePreview
    ? `Report Message`
    : `Report ${isUser ? target.username : 'User'}`;

  return ReactDOM.createPortal(
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-primary)' }}>{title}</h2>
        {target?.messagePreview && (
          <div style={{
            background: 'var(--bg-tertiary)', borderRadius: 6, padding: '8px 12px',
            marginBottom: 12, fontSize: 13, color: 'var(--text-muted)',
            borderLeft: '3px solid var(--text-muted)', maxHeight: 60, overflow: 'hidden',
          }}>
            {target.messagePreview}
          </div>
        )}
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-muted)' }}>
          Select a reason for this report.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {REPORT_TYPES.map(rt => (
            <label
              key={rt.value}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                background: reportType === rt.value ? 'var(--brand-500)' : 'var(--bg-tertiary)',
                borderRadius: 6, cursor: 'pointer', transition: 'background 0.15s',
                border: reportType === rt.value ? '1px solid var(--brand-500)' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <input
                type="radio" name="reportType" value={rt.value}
                checked={reportType === rt.value}
                onChange={() => setReportType(rt.value)}
                style={{ marginTop: 2, accentColor: 'var(--brand-500)' }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: reportType === rt.value ? '#fff' : 'var(--text-primary)' }}>
                  {rt.label}
                </div>
                <div style={{ fontSize: 12, color: reportType === rt.value ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', marginTop: 2 }}>
                  {rt.description}
                </div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--header-secondary)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
            Additional Details (optional)
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Provide any additional context..."
            maxLength={500}
            rows={3}
            style={{
              width: '100%', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 4, padding: '10px 12px', color: 'var(--text-normal)', fontSize: 14,
              fontFamily: 'var(--font-body)', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-muted)', fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reportType || submitting}
            style={{
              padding: '8px 16px', borderRadius: 4, border: 'none', cursor: reportType ? 'pointer' : 'default',
              background: reportType ? 'var(--red, #ED4245)' : 'var(--bg-tertiary)',
              color: reportType ? '#fff' : 'var(--text-muted)', fontSize: 14, fontWeight: 600,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReportModal;
