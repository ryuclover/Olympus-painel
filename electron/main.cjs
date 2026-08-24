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
function waitForBackend(maxRetries = 180, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    let settled = false;

    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    if (backendProcess) {
      backendProcess.once('close', (code) => {
        if (!settled) {
          fail(new Error(`O backend encerrou antes de ficar disponível (código ${code ?? 'desconhecido'}).`));
        }
      });
    }

    function check() {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/contratos`, (res) => {
        res.resume();
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      req.on('error', () => {
        if (retries >= maxRetries) {
          fail(new Error('Backend não respondeu dentro do tempo esperado.'));
        } else {
          retries++;
          setTimeout(check, interval);
        }
      });
      req.setTimeout(300, () => {
        req.destroy();
        if (retries >= maxRetries) {
          fail(new Error('Timeout aguardando o backend.'));
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
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  } else {
    const entryPoint = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(entryPoint).catch((error) => {
      dialog.showErrorBox('Erro ao carregar Olympus Painel', `Não foi possível abrir a interface.\n\n${error.message}`);
    });
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Falha ao carregar ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] Processo de renderização encerrado:', details.reason);
    dialog.showErrorBox('Interface encerrada', `A interface do aplicativo foi encerrada. Motivo: ${details.reason}`);
  });

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

  backendProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`[Electron] Backend encerrou com código ${code}.`);
    }
  });
}

// ─── Fluxo principal ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  createSplash();
  startBackend();

  if (!isDev) {
    try {
      await waitForBackend();
    } catch (err) {
      dialog.showErrorBox(
        'Servidor não disponível',
        `O servidor interno não ficou disponível.\n\n${err.message}\n\nFeche outra instância do Olympus Painel e tente novamente.`
      );
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill();
      }
      app.quit();
      return;
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
