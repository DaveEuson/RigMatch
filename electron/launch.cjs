const { spawn } = require('node:child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronArgs = ['.'];
if (process.platform === 'linux' && process.env.RIGMATCH_ENABLE_GPU !== '1') {
  electronArgs.push('--no-sandbox', '--disable-gpu');
}

const child = spawn(electronPath, electronArgs, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
