import { Sequelize } from 'sequelize';
import { DatabaseConst } from '../constants/constant';
import dotenv from 'dotenv';
dotenv.config();

export const TCConnectionString = new Sequelize(
  DatabaseConst.monday_app_event,
  process.env.DB_MYSQL_USERNAME || 'dev',
  process.env.DB_MYSQL_PASSWORD || 'Tutoringclub@321',
  {
    host: process.env.DB_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_MYSQL_PORT) || 3306,
    dialect: 'mysql',
    pool: {
      max: 50,
      idle: 60000,
      evict: 55000,
    },
  },
);
