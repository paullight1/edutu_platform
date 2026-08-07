import { createVoiceGateway } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './observability/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const gateway = createVoiceGateway(config);
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutdown_requested', { signal });
    const forceExit = setTimeout(() => process.exit(1), 15_000);
    forceExit.unref();
    try {
      await gateway.stop();
      clearTimeout(forceExit);
      process.exitCode = 0;
    } catch (error) {
      logger.error('shutdown_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('unhandledRejection', (error: unknown) => {
    logger.error('unhandled_rejection', { errorName: error instanceof Error ? error.name : 'UnknownError' });
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught_exception', { errorName: error.name });
    void shutdown('uncaughtException');
  });

  await gateway.start();
}

main().catch((error: unknown) => {
  logger.error('startup_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
  process.exitCode = 1;
});
