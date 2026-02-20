import React from 'react';

const MicrophoneIcon = ({ size = 20, color = 'currentColor', muted = false, ...props }) => {
  if (muted) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M19 11C19 14.866 15.866 18 12 18M12 18C8.13401 18 5 14.866 5 11M12 18V22M12 22H8M12 22H16" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 2C13.6569 2 15 3.34315 15 5V11C15 12.6569 13.6569 14 12 14C10.3431 14 9 12.6569 9 11V5C9 3.34315 10.3431 2 12 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="4" y1="4" x2="20" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M19 11C19 14.866 15.866 18 12 18M12 18C8.13401 18 5 14.866 5 11M12 18V22M12 22H8M12 22H16" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 2C13.6569 2 15 3.34315 15 5V11C15 12.6569 13.6569 14 12 14C10.3431 14 9 12.6569 9 11V5C9 3.34315 10.3431 2 12 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

export default MicrophoneIcon;
