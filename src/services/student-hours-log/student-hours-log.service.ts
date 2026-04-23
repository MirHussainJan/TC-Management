import QueueService from '../queue.service';
import { QueueName } from '../../constants/constant-queue';
import amqp from 'amqplib/callback_api';
import credentials from 'amqplib/lib/credentials';
import SHLAddFromWSService from './shl-add-from-ws.service';
import SHLAddFamilySHLService from './shl-add-family-shl.service';
import SHLDeductHoursService from './shl-deduct-hours.service';

export default class StudentHoursLogService {
  static rabbitChannel;

  start(queueName) {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      async (err, conn) => {
        if (err) {
          console.error('StudentHoursLogService ' + queueName + '[AMQP]', err.message);
          return setTimeout(this.start, 10000);
        }
        conn.on('error', function (err) {
          if (err.message !== 'Connection closing') {
            console.error('StudentHoursLogService ' + queueName + '[AMQP] conn error', err.message);
            return setTimeout(this.start, 10000);
          }
        });
        conn.on('close', function () {
          console.error('StudentHoursLogService ' + queueName + '[AMQP] reconnecting');
          return setTimeout(this.start, 10000);
        });
        console.log('StudentHoursLogService ' + queueName + '[AMQP Send] connected');
        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            throw error1;
          }

          await channel.assertQueue(queueName, {
            durable: false,
          });
          channel.prefetch(1);
          StudentHoursLogService.rabbitChannel = channel;
        });
      },
    );
  }

  static async DeductHours(eventData) {
    try {
      // Queue listeners are disabled in app bootstrap in this codebase,
      // so execute directly to ensure the attendance flow always runs.
      await SHLDeductHoursService.DeductHours(eventData);
    } catch (error) {
      throw error;
    }
  }

  static async AddFromWS(eventData) {
    try {
      // await QueueService.SendQueue(QueueName.SHLAddFromWS, eventData);
      await SHLAddFromWSService.AddFromWS(eventData);
    } catch (error) {
      throw error;
    }
  }

  static async AddFamilySHL(eventData) {
    try {
      // await QueueService.SendQueue(QueueName.SHLAddFamilySHL, eventData);
      await SHLAddFamilySHLService.AddFamilySHL(eventData);
    } catch (error) {
      throw error;
    }
  }

  static async AuditedRemainingHour(eventData) {
    try {
      await QueueService.SendQueue(QueueName.SHLAuditedRemainingHour, eventData);
      // await SHLAuditedRemainingHourService.Run(eventData);
    } catch (error) {
      throw error;
    }
  }
}
