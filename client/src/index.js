import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initCapacitor } from './capacitor-init';
import './index.css';

initCapacitor();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
