/**
 * Daytona sandbox smoke test.
 *
 * Initializes the Daytona client, creates a sandbox, runs a "Hello, World!"
 * program inside it, captures the output, and deletes the sandbox.
 *
 * Requires DAYTONA_API_KEY — Bun loads it automatically from .env when run
 * as `bun scripts/daytona-hello.ts`.
 */

import { Daytona } from '@daytona/sdk';

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    console.error(
      'DAYTONA_API_KEY is not set.\n\n' +
        '1. Create an API key at https://app.daytona.io/dashboard/keys\n' +
        '2. Add it to .env as: DAYTONA_API_KEY=<your key>\n' +
        '3. Run this script again: bun scripts/daytona-hello.ts'
    );
    process.exit(1);
  }

  // Initialize the SDK (reads DAYTONA_API_KEY / DAYTONA_API_URL from the environment)
  const daytona = new Daytona();

  console.log('Creating sandbox…');
  const sandbox = await daytona.create({
    language: 'typescript',
    name: 'ai-agent-hello-world',
    labels: { purpose: 'hello-world-smoke-test' },
  });
  console.log(`Sandbox created: id=${sandbox.id} name=${sandbox.name}`);

  try {
    console.log('Running "Hello, World!" program inside the sandbox…');
    const response = await sandbox.process.codeRun(`
      const message = 'Hello, World!';
      console.log(message + ' — executed inside a Daytona sandbox');
    `);

    const output = (response.artifacts?.stdout ?? response.result ?? '').trim();
    if (response.exitCode !== 0) {
      console.error(`Program failed with exit code ${response.exitCode}`);
      console.error(output);
      process.exitCode = 1;
    } else {
      console.log('Captured output from inside the sandbox:');
      console.log(`  ${output}`);
    }
  } finally {
    // Always clean up so the sandbox doesn't consume quota
    console.log('Deleting sandbox…');
    await sandbox.delete(60, true);
    console.log('Sandbox deleted.');
  }
}

main().catch((error) => {
  console.error('Daytona smoke test failed:', error);
  process.exit(1);
});
