import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <SettingsProvider>
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary><App /></ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </SettingsProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
