import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: 'proj_hnpunsdibhbdlcdcgube',
  runtime: 'node-24',
  logLevel: 'log',
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/trigger'],
  build: {
    // @daytona/sdk does runtime dynamic imports (e.g. import('form-data') in
    // FileSystem.uploadFile) that the bundler can't trace — bundling it made
    // those imports fail with "Cannot find module 'form-data'" on the deployed
    // runtime. Keep it external so it (and its deps) load from real
    // node_modules in the deployed image.
    external: ['@daytona/sdk'],
  },
});
