import mongoose from 'mongoose';
import { config } from '../config';

export const getConnection = () => {
  const url =
    'mongodb://' +
    `${config.MONGODB_USERNAME}:${config.MONGODB_PASSWORD}` +
    '@' +
    `${config.MONGODB_HOST}:${config.MONGODB_PORT}` +
    '/' +
    `${config.MONGODB_DATABASE}?authSource=admin`;

  return mongoose.connect(url, { dbName: config.MONGODB_DATABASE });
};
