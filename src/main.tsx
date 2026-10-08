import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {CredentialsProvider} from './contexts/CredentialsContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CredentialsProvider><App /></CredentialsProvider>
  </StrictMode>,
);
