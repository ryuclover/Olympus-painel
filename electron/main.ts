import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Olympus Painel',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Em produção, vamos carregar o index.html compilado
  // Em desenvolvimento, vamos acessar a porta do vite
  if (isDev) {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  const backendExe = isDev 
    ? path.join(__dirname, '../../backend/dist/backend.exe')
    : path.join(process.resourcesPath, 'backend.exe');

  try {
    backendProcess = spawn(backendExe, [], {
      detached: false, // ensures process is killed when parent dies
      stdio: 'ignore'
    });

    backendProcess.on('error', (err) => {
      console.error('Falha ao iniciar backend:', err);
    });
  } catch (error) {
    console.error('Erro geral ao iniciar o backend', error);
  }
}

app.whenReady().then(() => {
  // Inicializa o backend primeiro
  startBackend();

  // Espera um pouco para o servidor subir antes de renderizar
  setTimeout(createMainWindow, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGINT');
  }
});
