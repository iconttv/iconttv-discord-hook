import * as winston from 'winston';
import dailyRotateFile from 'winston-daily-rotate-file';
import moment from 'moment';
import { resolve } from 'path';

export function channel_log_message(logMessage: string, context: object) {
  return JSON.stringify(
    {
      message: logMessage,
      ...context,
    },
    (key, value) => (typeof value === 'bigint' ? value.toString() : value)
  );
}

const logDir = resolve(__dirname, '../../logs');

const loggerFormat = winston.format.printf(info => {
  let logMessage = `${info.timestamp} [${info.level.toUpperCase()}] ${
    info.message
  }`;
  if (info.stack) {
    logMessage += ` ${info.stack}`;
  }
  return logMessage;
});

const winstonFormat = winston.format.combine(
  winston.format.timestamp({
    format: () => moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  }),
  winston.format.errors({ stack: true }),
  loggerFormat
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'dev' ? 'silly' : 'debug',
  format: winstonFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.errors({ stack: true })
      ),
      level: 'silly',
    }),
    new dailyRotateFile({
      filename: resolve(logDir, 'all.%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
    }),
    new dailyRotateFile({
      filename: resolve(logDir, 'error.%DATE%.log'),
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
});

export default logger;
