import React, { useRef, useEffect, useState } from 'react';

const StatusDot = ({ size = 12, status = 'online', ...props }) => {
  const ref = useRef(null);
  const [fill, setFill] = useState('#747f8d');
  const [stroke, setStroke] = useState('#1a1c1f');

  useEffect(() => {
    if (!ref.current) return;
    const styles = getComputedStyle(document.documentElement);
    const varMap = {
      online: '--status-online',
      idle: '--status-idle',
      dnd: '--status-dnd',
      offline: '--status-offline'
    };
    const varName = varMap[status] || varMap.offline;
    setFill(styles.getPropertyValue(varName).trim() || '#747f8d');
    setStroke(styles.getPropertyValue('--bg-primary').trim() || '#1a1c1f');
  }, [status]);

  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="8" r="6" fill={fill}/>
      <circle cx="8" cy="8" r="6" stroke={stroke} strokeWidth="2"/>
    </svg>
  );
};

export default StatusDot;
