const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;
const BACKEND_PORT = 9001;
const isDev = process.env.NODE_ENV === 'development';

// ─── Aguarda o backend responder ─────────────────────────────────────────────
function waitForBackend(maxRetries = 40, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    function check() {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/contratos`, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (retries >= maxRetries) {
          reject(new Error('Backend não respondeu.'));
        } else {
          retries++;
          setTimeout(check, interval);
        }
      });
      req.setTimeout(300, () => {
        req.destroy();
        if (retries >= maxRetries) {
          reject(new Error('Timeout do backend.'));
        } else {
          retries++;
          setTimeout(check, interval);
        }
      });
    }
    check();
  });
}

// ─── Splash screen ───────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#0f1117',
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// ─── Janela principal ────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1024,
    minHeight: 600,
    title: 'Olympus Painel',
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // Fecha splash e mostra janela principal
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Abre links externos no browser padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Inicia o backend Python ─────────────────────────────────────────────────
function startBackend() {
  if (isDev) {
    console.log('[Electron] Dev mode: backend deve estar rodando na porta', BACKEND_PORT);
    return;
  }

  const backendExe = path.join(process.resourcesPath, 'backend', 'backend.exe');
  console.log('[Electron] Iniciando:', backendExe);

  backendProcess = spawn(backendExe, [], {
    detached: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (d) => process.stdout.write('[Backend] ' + d));
  }
  if (backendProcess.stderr) {
    backendProcess.stderr.on('data', (d) => process.stderr.write('[Backend ERR] ' + d));
  }

  backendProcess.on('error', (err) => {
    dialog.showErrorBox(
      'Erro ao iniciar Olympus Painel',
      `O servidor interno não pôde ser iniciado.\n\n${err.message}\n\nTente reinstalar o aplicativo.`
    );
  });
}

// ─── Fluxo principal ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  startBackend();

  if (!isDev) {
    try {
      await waitForBackend();
    } catch (err) {
      dialog.showErrorBox(
        'Servidor não disponível',
        'O servidor interno não iniciou a tempo. Tente reabrir o aplicativo.'
      );
    }
  } else {
    // Em dev, aguarda 1s apenas para dar tempo ao vite
    await new Promise(r => setTimeout(r, 1000));
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
  }
});
