import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

export const redisClient = createClient({ 
    url:`redis://${process.env.DB_REDIS_HOST || '159.203.136.116'}:${process.env.DB_REDIS_PORT || '6379'}`,
    password: process.env.DB_REDIS_PASSWORD || 'Blab@321' });
