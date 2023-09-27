import * as winston from 'winston';
import dailyRotateFile from 'winston-daily-rotate-file';

const loggerFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(), // Add timestamp to logs
    loggerFormat // Apply the custom format
  ),
  transports: [
    new winston.transports.Console(),
    new dailyRotateFile({
      filename: 'logs/info.%DATE%.log',
      json: true,
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
    new dailyRotateFile({
      filename: 'logs/error.%DATE%.log',
      json: true,
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
});

export default logger;
