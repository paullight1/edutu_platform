type SafeLogValue = string | number | boolean | null | undefined;
type SafeLogFields = Record<string, SafeLogValue>;

const forbiddenField = /(authorization|token|secret|password|credential|sdp|ice|dtls|fingerprint|address|ip)/i;

export interface Logger {
  debug(event: string, fields?: SafeLogFields): void;
  info(event: string, fields?: SafeLogFields): void;
  warn(event: string, fields?: SafeLogFields): void;
  error(event: string, fields?: SafeLogFields): void;
}

function sanitize(fields: SafeLogFields | undefined): SafeLogFields | undefined {
  if (!fields) return undefined;
  return Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => !forbiddenField.test(key) && value !== undefined),
  );
}

function write(level: string, event: string, fields?: SafeLogFields): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: 'edutu-voice',
    event,
    ...sanitize(fields),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger: Logger = {
  debug: (event, fields) => write('debug', event, fields),
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
