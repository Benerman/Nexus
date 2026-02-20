import React from 'react';

const EmojiIcon = ({ size = 20, color = 'currentColor', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="9" y1="9" x2="9.01" y2="9" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="15" y1="9" x2="15.01" y2="9" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

export default EmojiIcon;
