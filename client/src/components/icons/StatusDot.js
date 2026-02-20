import React from 'react';

const StatusDot = ({ size = 12, status = 'online', ...props }) => {
  const colorMap = {
    online: '#43b581',
    idle: '#faa61a',
    dnd: '#f04747',
    offline: '#747f8d'
  };

  const color = colorMap[status] || colorMap.offline;

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="8" r="6" fill={color}/>
      <circle cx="8" cy="8" r="6" stroke="#2c2f33" strokeWidth="2"/>
    </svg>
  );
};

export default StatusDot;
