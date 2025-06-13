import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = createClient({ url: redisUrl });

redis.on('error', (err) => console.error('Redis Client Error', err));

await redis.connect();

export default redis;
