import * as winston from 'winston';
import dailyRotateFile from 'winston-daily-rotate-file';
import moment from 'moment';

const loggerFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const winstonFormat = winston.format.combine(
  winston.format.timestamp({
    format: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  }),
  loggerFormat
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winstonFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winstonFormat,
        winston.format.colorize(),
      ),
    }),
    new dailyRotateFile({
      filename: 'logs/all.%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
    }),
    new dailyRotateFile({
      filename: 'logs/error.%DATE%.log',
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
});

export default logger;
