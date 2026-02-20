import React, { useState, useEffect, useRef } from 'react';
import './PollCreator.css';

function PollCreator({ onClose, onSubmit }) {
  const [question, setQuestion] = useState('');
  const [pollType, setPollType] = useState('yes_no');
  const [options, setOptions] = useState(['', '']);
  const questionRef = useRef(null);

  useEffect(() => {
    questionRef.current?.focus();
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const getOptions = () => {
    switch (pollType) {
      case 'true_false': return ['True', 'False'];
      case 'yes_no': return ['Yes', 'No'];
      case 'multiple': return options.filter(o => o.trim());
      default: return ['Yes', 'No'];
    }
  };

  const handleSubmit = () => {
    if (!question.trim()) return;
    const opts = getOptions();
    if (opts.length < 2) return;
    onSubmit({ type: 'poll', question: question.trim(), pollType, options: opts });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && question.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="poll-creator-overlay" onClick={onClose}>
      <div className="poll-creator" onClick={e => e.stopPropagation()}>
        <div className="poll-creator-header">
          <h3>Create a Poll</h3>
          <button className="poll-creator-close" onClick={onClose}>✕</button>
        </div>

        <div className="poll-creator-body">
          <label className="poll-label">Question</label>
          <input
            ref={questionRef}
            className="poll-input"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            maxLength={200}
          />

          <label className="poll-label">Poll Type</label>
          <div className="poll-type-buttons">
            <button
              className={`poll-type-btn ${pollType === 'yes_no' ? 'active' : ''}`}
              onClick={() => setPollType('yes_no')}
            >Yes / No</button>
            <button
              className={`poll-type-btn ${pollType === 'true_false' ? 'active' : ''}`}
              onClick={() => setPollType('true_false')}
            >True / False</button>
            <button
              className={`poll-type-btn ${pollType === 'multiple' ? 'active' : ''}`}
              onClick={() => setPollType('multiple')}
            >Multiple Choice</button>
          </div>

          {pollType === 'multiple' && (
            <div className="poll-options-editor">
              <label className="poll-label">Options</label>
              {options.map((opt, i) => (
                <div key={i} className="poll-option-input-row">
                  <input
                    className="poll-input"
                    value={opt}
                    onChange={e => {
                      const newOpts = [...options];
                      newOpts[i] = e.target.value;
                      setOptions(newOpts);
                    }}
                    placeholder={`Option ${i + 1}`}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <button className="poll-remove-option" onClick={() => setOptions(options.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button className="poll-add-option" onClick={() => setOptions([...options, ''])}>
                  + Add Option
                </button>
              )}
            </div>
          )}
        </div>

        <div className="poll-creator-actions">
          <button className="poll-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="poll-submit-btn"
            onClick={handleSubmit}
            disabled={!question.trim() || (pollType === 'multiple' && options.filter(o => o.trim()).length < 2)}
          >Create Poll</button>
        </div>
      </div>
    </div>
  );
}

export default PollCreator;
