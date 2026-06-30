import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './react-home.css';
import App from './App.jsx';

createRoot(document.getElementById('react-root')).render(<App />);