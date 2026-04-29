import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import routes from './routes';
import morgan from 'morgan';
import helmet from 'helmet';
// import { redisClient } from './config/redis';
import { TCConnectionString } from './config/mysql';
import QueueService from './services/queue.service';
import axios from 'axios';
import CronJob from 'node-cron';
import CronService from './services/cron.service';

const scheduleEveryThirtyMins = '*/30 * * * *';
const schedule10PMEST = '0 3 * * *';
dotenv.config();

(async () => {
  // redisClient.on('error', (err) => {
  //   console.log('Redis Client Error', err);
  // });
  // redisClient.on('ready', () => console.log('Redis is ready'));

  // await redisClient.connect();

  // await redisClient.ping();

  // await TCConnectionString.authenticate()
  //   .then(() => {
  //     console.log('MySQL is ready');
  //     CronJob.schedule(scheduleEveryThirtyMins, () => {
  //       CronService.CheckAppLog();
  //       CronService.checkBoardAppLog();
  //     });
  //     CronJob.schedule(schedule10PMEST, () => {
  //       CronService.RunOn10PMEST();
  //     });
  //   })
  //   .catch((e) => {
  //     console.log(`MySQL error ${e}`);
  //   });
})();

const app = express();
const port = process.env.PORT;

app.use(morgan('dev'));
app.use(helmet.hsts());
app.use(bodyParser.json());
app.use(routes);

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);

  QueueService.Listeners();
});

export default app;
