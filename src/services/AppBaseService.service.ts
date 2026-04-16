import amqp from 'amqplib/callback_api';
import credentials from 'amqplib/lib/credentials';
import initMondayClient from 'monday-sdk-js';
import dotenv from 'dotenv';
import Logger from '../helper/logger';

dotenv.config();

export abstract class AppBaseService {
  static rabbitChannel;
  static mondayClient = initMondayClient();

  static start(queueName) {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      (err, conn) => {
        if (err) {
          console.error('AppBaseService ' + queueName + '[AMQP]', err.message);
          return setTimeout(() => this.start(queueName), 10000);
        }
        conn.on('error', (err) => {
          if (err.message !== 'Connection closing') {
            console.error('AppBaseService ' + queueName + '[AMQP] conn error', err.message);
            return setTimeout(() => this.start(queueName), 10000);
          }
        });
        conn.on('close', () => {
          console.error('AppBaseService ' + queueName + '[AMQP] reconnecting');
          return setTimeout(() => this.start(queueName), 10000);
        });
        console.log('AppBaseService ' + queueName + '[AMQP Send] connected');
        conn.createChannel((error1, channel) => {
          if (error1) {
            console.error('[AMQP]', error1);
            return setTimeout(() => this.start(queueName), 2000);
          }
          channel.assertQueue(queueName, { durable: false }, (err2, ok) => {
            if (err2) {
              console.error('AppBaseService ' + queueName + '[AMQP] Error asserting queue:', err2.message);
              return setTimeout(() => this.start(queueName), 2000);
            }
            channel.prefetch(1);
            AppBaseService.rabbitChannel = channel;
            console.log('AppBaseService ' + queueName + '[AMQP] Channel created and queue asserted successfully.');
          });

          // try {
          //   await channel.assertQueue(queueName, {
          //     durable: false,
          //   });
          //   channel.prefetch(1);
          //   this.rabbitChannel = channel;
          //   console.log('AppBaseService ' + queueName + 'AppBaseService [AMQP] Channel created and queue asserted successfully.');
          // } catch (err) {
          //   console.error('AppBaseService ' + queueName + 'AppBaseService [AMQP] Error asserting queue:', err.message);
          //   setTimeout(() => AppBaseService.start(queueName), 2000);
          // }
        });
      },
    );
  }

  static async post(query, variables = {}) {
    const rs: any = await this.mondayClient.api(query, {
      token: process.env.MONDAY_ACCESS_TOKEN,
      apiVersion: '2025-04',
      variables: variables,
    });
    if (rs?.error_code?.length || rs?.error_message?.length) {
      Logger.log(`error: ${rs?.error_message} - ${query}`);
    }
    if (rs?.error_code?.includes('ComplexityException') && rs?.error_message?.includes('Complexity budget exhausted, query cost')) {
      await new Promise((resolve) => setTimeout(resolve, 60000));
      await this.post(query);
    }
    return rs;
  }
}
