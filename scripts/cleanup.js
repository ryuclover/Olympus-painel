import { exec } from 'child_process';
import killPort from 'kill-port';

async function cleanup() {
  console.log('Limpando processos anteriores...');
  try {
    await killPort(9000);
    console.log('Porta 9000 liberada.');
  } catch (e) {}

  try {
    await killPort(9001);
    console.log('Porta 9001 liberada.');
  } catch (e) {}

  if (process.platform === 'win32') {
    exec('taskkill /f /im electron.exe', (err) => {
      if (!err) console.log('Sessões antigas do Electron encerradas.');
    });
  } else {
    exec('pkill -f electron', (err) => {
      if (!err) console.log('Sessões antigas do Electron encerradas.');
    });
  }
}

cleanup();
