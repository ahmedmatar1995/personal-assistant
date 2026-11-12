/** Probe: does the typescript sandbox run .ts files via `node`? Which node? */
import { Daytona } from '@daytona/sdk';

async function main() {
  const daytona = new Daytona();
  const sandbox = await daytona.create({
    language: 'typescript',
    name: `ai-agent-ts-probe-${Date.now().toString(36)}`,
    labels: { project: 'ai-agent', purpose: 'ts-probe' },
  });
  try {
    console.log('id:', sandbox.id);
    const v = await sandbox.process.executeCommand('node --version 2>&1', undefined, undefined, 30);
    console.log('node:', v.result.trim());

    const code = `
      const x: number = 40;
      const y: number = 2;
      console.log('TS executed:', x + y);
    `;
    await sandbox.fs.uploadFile(Buffer.from(code, 'utf8'), '/home/daytona/code.ts', 30);
    const run = await sandbox.process.executeCommand('node /home/daytona/code.ts 2>&1', undefined, undefined, 60);
    console.log('exitCode:', run.exitCode);
    console.log('output:', run.result.trim());
  } finally {
    await sandbox.delete(60, true);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
