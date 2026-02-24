import React from 'react';
import './ActivityPanel.css';

function ActivityIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function JobCard({ job, onRemove }) {
  const progress = typeof job.progress === 'number' ? Math.round(job.progress * 100) : 0;
  const isRunning = job.status === 'running';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';

  let statusText = '';
  if (isRunning) {
    statusText = job.currentItem || `${progress}%`;
  } else if (isCompleted) {
    const s = job.summary;
    if (s && typeof s === 'object') {
      const parts = [];
      if (s.succeeded) parts.push(`${s.succeeded} succeeded`);
      if (s.failed) parts.push(`${s.failed} failed`);
      if (s.skipped) parts.push(`${s.skipped} skipped`);
      statusText = parts.length ? parts.join(', ') : 'Completed';
    } else {
      statusText = typeof s === 'string' ? s : 'Completed';
    }
  } else if (isFailed) {
    statusText = job.error || 'Failed';
  }

  return (
    <div className="activity-job">
      <div className="activity-job-header">
        <div className="activity-job-info">
          <div className="activity-job-label" title={job.label}>{job.label}</div>
          {statusText && <div className="activity-job-detail" title={statusText}>{statusText}</div>}
        </div>
        {(isCompleted || isFailed) && (
          <button className="activity-job-dismiss" onClick={() => onRemove(job.id)} title="Dismiss">&times;</button>
        )}
      </div>
      <div className="activity-progress-track">
        <div
          className={`activity-progress-fill ${isCompleted ? 'completed' : ''} ${isFailed ? 'failed' : ''}`}
          style={{ width: `${isCompleted ? 100 : isFailed ? 100 : progress}%` }}
        />
      </div>
      <div className={`activity-job-status ${job.status}`}>
        <span className={`activity-status-dot ${job.status}`} />
        {isRunning && 'In progress'}
        {isCompleted && 'Completed'}
        {isFailed && 'Failed'}
      </div>
    </div>
  );
}

export { ActivityIcon };

export default function ActivityPanel({ jobs, onRemove, onClear, onClose }) {
  const hasJobs = jobs && jobs.length > 0;

  return (
    <>
      <div className="activity-backdrop" onClick={onClose} />
      <div className="activity-panel">
        <div className="activity-panel-header">
          <span className="activity-panel-title">Activity</span>
          <div className="activity-panel-actions">
            {hasJobs && (
              <button className="activity-clear-btn" onClick={onClear}>Clear all</button>
            )}
            <button className="activity-close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="activity-panel-body">
          {hasJobs ? (
            jobs.map(job => (
              <JobCard key={job.id} job={job} onRemove={onRemove} />
            ))
          ) : (
            <div className="activity-empty">
              <div className="activity-empty-icon">
                <ActivityIcon size={32} />
              </div>
              <div className="activity-empty-text">No active operations</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
