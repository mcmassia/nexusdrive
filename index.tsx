import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { authService } from './services/authService';
import { SettingsProvider } from './components/SettingsContext';

// Initialize auth service
authService.init();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>
);