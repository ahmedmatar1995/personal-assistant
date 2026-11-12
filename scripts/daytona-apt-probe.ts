/** Probe: why does apt fail in the sandbox? Prints stderr merged into stdout. */
import { Daytona } from '@daytona/sdk';

async function main() {
  const daytona = new Daytona();
  const sandbox = await daytona.create({
    language: 'python',
    name: `ai-agent-apt-probe-${Date.now().toString(36)}`,
    labels: { project: 'ai-agent', purpose: 'apt-probe' },
  });
  try {
    console.log('id:', sandbox.id);

    console.log('\n--- whoami / os ---');
    const env = await sandbox.process.executeCommand(
      'whoami; cat /etc/os-release | head -2; ls /etc/apt/sources.list.d/ 2>&1; cat /etc/apt/sources.list 2>/dev/null | head -5; echo "sources-list-exists: $?"',
      undefined,
      undefined,
      60
    );
    console.log(env.result);

    console.log('\n--- apt-get update (stderr merged) ---');
    const upd = await sandbox.process.executeCommand(
      'apt-get update 2>&1 | tail -15',
      undefined,
      undefined,
      180
    );
    console.log('exitCode:', upd.exitCode);
    console.log(upd.result);

    console.log('\n--- sudo -n true (passwordless?) ---');
    const sud = await sandbox.process.executeCommand('sudo -n true 2>&1; echo "sudo-exit: $?"', undefined, undefined, 30);
    console.log(sud.result);

    if (sud.result.includes('sudo-exit: 0')) {
      console.log('\n--- sudo apt-get update + install tesseract-ocr ---');
      const inst = await sandbox.process.executeCommand(
        'sudo apt-get update -qq 2>&1 | tail -5 && sudo apt-get install -y -qq tesseract-ocr 2>&1 | tail -10 && echo APT-OK',
        undefined,
        undefined,
        300
      );
      console.log('exitCode:', inst.exitCode);
      console.log(inst.result);
      if (inst.result.includes('APT-OK')) {
        const ver = await sandbox.process.executeCommand('tesseract --version 2>&1 | head -1', undefined, undefined, 30);
        console.log('tesseract:', ver.result.trim());
      }
    }
  } finally {
    await sandbox.delete(60, true);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
