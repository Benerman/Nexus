import React from 'react';

const HeadphoneIcon = ({ size = 20, color = 'currentColor', deafened = false, ...props }) => {
  if (deafened) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M3 18V12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12V18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 18C21 19.6569 19.6569 21 18 21H17C16.4477 21 16 20.5523 16 20V16C16 15.4477 16.4477 15 17 15H21V18Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 18C3 19.6569 4.34315 21 6 21H7C7.55228 21 8 20.5523 8 20V16C8 15.4477 7.55228 15 7 15H3V18Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="4" y1="4" x2="20" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 18V12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12V18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 18C21 19.6569 19.6569 21 18 21H17C16.4477 21 16 20.5523 16 20V16C16 15.4477 16.4477 15 17 15H21V18Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 18C3 19.6569 4.34315 21 6 21H7C7.55228 21 8 20.5523 8 20V16C8 15.4477 7.55228 15 7 15H3V18Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

export default HeadphoneIcon;
