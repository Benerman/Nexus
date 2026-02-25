import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import './WelcomeTour.css';

const SLIDES = [
  {
    title: 'Welcome to Nexus!',
    description: 'A real-time communication platform for text, voice, and video. Let\'s show you around.',
    icon: '👋'
  },
  {
    title: 'Servers & Channels',
    description: 'Servers are communities with text and voice channels. Join existing ones or create your own.',
    icon: '🏠'
  },
  {
    title: 'Direct Messages',
    description: 'Send private messages, share files, and start voice or video calls with friends.',
    icon: '💬'
  },
  {
    title: 'Voice & Video',
    description: 'Join voice channels for real-time conversations with screen sharing and video support.',
    icon: '🎙️'
  },
  {
    title: 'Get Started',
    description: 'Join the Nexus community server to meet other users, or skip and explore on your own.',
    icon: '🚀'
  }
];

const TOOLTIP_STEPS = [
  { selector: '.server-list', text: 'Your servers appear here. Click to switch between them.', position: 'right' },
  { selector: '.sidebar', text: 'Text and voice channels are listed in the sidebar.', position: 'right' },
  { selector: '.main-content', text: 'Messages and conversations appear in this area.', position: 'left' },
  { selector: '.add-server-btn', text: 'Create or join new servers with this button.', position: 'right' }
];

export default function WelcomeTour({ onComplete, onSkip }) {
  const [phase, setPhase] = useState('modal'); // 'modal' | 'tooltips'
  const [slideIndex, setSlideIndex] = useState(0);
  const [tooltipStep, setTooltipStep] = useState(0);
  const [tooltipRect, setTooltipRect] = useState(null);
  const tooltipRef = useRef(null);

  const updateTooltipPosition = useCallback(() => {
    if (phase !== 'tooltips') return;
    const step = TOOLTIP_STEPS[tooltipStep];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      setTooltipRect(el.getBoundingClientRect());
    }
  }, [phase, tooltipStep]);

  useEffect(() => {
    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    return () => window.removeEventListener('resize', updateTooltipPosition);
  }, [updateTooltipPosition]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onSkip();
    }
  }, [onSkip]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleNextSlide = () => {
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex(slideIndex + 1);
    }
  };

  const handlePrevSlide = () => {
    if (slideIndex > 0) {
      setSlideIndex(slideIndex - 1);
    }
  };

  const handleJoinDefault = () => {
    onComplete(true);
  };

  const handleSkipToTooltips = () => {
    setPhase('tooltips');
  };

  const handleNextTooltip = () => {
    if (tooltipStep < TOOLTIP_STEPS.length - 1) {
      setTooltipStep(tooltipStep + 1);
    } else {
      onSkip();
    }
  };

  const handlePrevTooltip = () => {
    if (tooltipStep > 0) {
      setTooltipStep(tooltipStep - 1);
    }
  };

  const isLastSlide = slideIndex === SLIDES.length - 1;
  const currentStep = TOOLTIP_STEPS[tooltipStep];

  // Calculate tooltip box position
  const getTooltipStyle = () => {
    if (!tooltipRect || !currentStep) return {};
    const padding = 12;
    if (currentStep.position === 'right') {
      return {
        top: tooltipRect.top + tooltipRect.height / 2,
        left: tooltipRect.right + padding,
        transform: 'translateY(-50%)'
      };
    }
    return {
      top: tooltipRect.top + tooltipRect.height / 2,
      right: window.innerWidth - tooltipRect.left + padding,
      transform: 'translateY(-50%)'
    };
  };

  if (phase === 'modal') {
    return ReactDOM.createPortal(
      <div className="tour-overlay" onClick={onSkip}>
        <div className="tour-modal" onClick={e => e.stopPropagation()}>
          <div className="tour-slide">
            <div className="tour-slide-icon">{SLIDES[slideIndex].icon}</div>
            <h2 className="tour-slide-title">{SLIDES[slideIndex].title}</h2>
            <p className="tour-slide-description">{SLIDES[slideIndex].description}</p>
          </div>

          {isLastSlide && (
            <div className="tour-actions">
              <button className="tour-btn tour-btn-primary" onClick={handleJoinDefault}>
                Join Nexus Server
              </button>
              <button className="tour-btn tour-btn-secondary" onClick={handleSkipToTooltips}>
                Skip for Now
              </button>
            </div>
          )}

          <div className="tour-nav">
            <button className="tour-nav-btn" onClick={handlePrevSlide} disabled={slideIndex === 0}>
              Back
            </button>
            <div className="tour-dots">
              {SLIDES.map((_, i) => (
                <span key={i} className={`tour-dot ${i === slideIndex ? 'active' : ''}`}
                  onClick={() => setSlideIndex(i)} />
              ))}
            </div>
            {!isLastSlide && (
              <button className="tour-nav-btn tour-nav-next" onClick={handleNextSlide}>
                Next
              </button>
            )}
            {isLastSlide && <div style={{ width: 60 }} />}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Phase: tooltips
  return ReactDOM.createPortal(
    <div className="tour-tooltip-overlay">
      {tooltipRect && (
        <div className="tour-spotlight" style={{
          top: tooltipRect.top - 6,
          left: tooltipRect.left - 6,
          width: tooltipRect.width + 12,
          height: tooltipRect.height + 12
        }} />
      )}
      {tooltipRect && (
        <div className="tour-tooltip" ref={tooltipRef} style={getTooltipStyle()}>
          <p className="tour-tooltip-text">{currentStep.text}</p>
          <div className="tour-tooltip-nav">
            <button className="tour-btn tour-btn-small" onClick={handlePrevTooltip} disabled={tooltipStep === 0}>
              Back
            </button>
            <span className="tour-tooltip-count">{tooltipStep + 1} / {TOOLTIP_STEPS.length}</span>
            <button className="tour-btn tour-btn-small tour-btn-primary" onClick={handleNextTooltip}>
              {tooltipStep === TOOLTIP_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
          <button className="tour-tooltip-skip" onClick={onSkip}>Skip tour</button>
        </div>
      )}
    </div>,
    document.body
  );
}
