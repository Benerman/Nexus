import React from 'react';

const HexagonIcon = ({ size = 20, color = 'currentColor', filled = false, ...props }) => {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M12 3L20.5 7.5V16.5L12 21L3.5 16.5V7.5L12 3Z"/>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 3L20.5 7.5V16.5L12 21L3.5 16.5V7.5L12 3Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

export default HexagonIcon;
