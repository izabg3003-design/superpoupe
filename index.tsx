
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("🚀 App renderizado com sucesso.");
} catch (error: any) {
  console.error("❌ Falha na renderização inicial do React:", error);
  const display = document.getElementById('error-display');
  if (display) {
    display.style.display = 'block';
    display.innerHTML = '<h2 style="color:white;">Erro na Inicialização do React</h2><p style="color:red;">' + error.message + '</p>';
  }
}
