import amqp from 'amqplib/callback_api';
import credentials from 'amqplib/lib/credentials';
import { QueueName } from '../constants/constant-queue';
import SHLDeductHoursService from './student-hours-log/shl-deduct-hours.service';
import SHLAuditedRemainingHourService from './student-hours-log/shl-audited-remaining-hour.service';
import SHLAddFromWSService from './student-hours-log/shl-add-from-ws.service';
import Logger from '../helper/logger';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as ReadingCurriculumService from './curriculum/reading-curriculum-to-monday.service';
import * as SessionFeedbackBinderAnalyticLogService from './curriculum/session-feedback-binder-analytic-log-to-monday.service';

const RABBITMQ_URL = () =>
  `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`;

const RABBITMQ_CREDENTIALS = () =>
  credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321');

export default class QueueService {
  // static rabbitChannel: any;
  static start(queueName, msg) {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      async (err, conn) => {
        if (err) {
          console.error('QueueService ' + queueName + '[AMQP] first error', err.message);
          return setTimeout(this.start, 10000);
        }
        conn.on('error', function (err) {
          if (err.message !== 'Connection closing') {
            console.error('QueueService ' + queueName + '[AMQP] conn error', err.message);
            return setTimeout(this.start, 10000);
          }
        });
        conn.on('close', function () {
          console.error('[AMQP] reconnecting');
          return setTimeout(this.start, 10000);
        });
        console.log('QueueService ' + queueName + '[AMQP Send] connected');
        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            throw error1;
          }

          await channel.assertQueue(queueName, {
            durable: false,
          });
          channel.prefetch(1);
          console.log('QueueService ' + queueName + ' send queue');
          channel.sendToQueue(queueName, Buffer.from(JSON.stringify(msg)));
          console.log('QueueService ' + queueName + ' sent queue');
        });
      },
    );
  }

  static async Listeners() {
    // const auth = {
    //   username: process.env.RABBITMQ_USERNAME ?? 'dev',
    //   password: process.env.RABBITMQ_PASSWORD ?? 'Tutoringclub@321',
    // };

    // axios
    //   .get(`http://${process.env.RABBITMQ_URL}:15672/api/vhosts/${process.env.RABBITMQ_VHOST}`, {
    //     auth: auth,
    //   }).then(async function (response) {
    //     await this.list();
    //   })
    //   .catch(function (error) {
    //     axios
    //       .put(
    //         `http://${process.env.RABBITMQ_URL}:15672/api/vhosts/${process.env.RABBITMQ_VHOST}`,
    //         {},
    //         {
    //           auth: auth,
    //         },
    //       )
    //       .then(async function (response) {
    //         await this.list();
    //       });
    //   });
    await this.list();
  }

  static async list() {
    this.ListenerSHLDeductHours();
    this.ListenerSHLAuditedRemainingHour();
    this.ListenerSHLAddFromWS();
    this.ListenerReadingCurriculumToMonday();
    this.ListenerSessionFeedbackBinderAnalyticLogToMonday();
    // this.ListenerForwardWebhook();
  }

  static SendDurableQueue(queueName, bodyData): Promise<string> {
    const jobId = randomUUID();
    const msg = { jobId, bodyData, createdAt: new Date().toISOString() };

    return new Promise((resolve, reject) => {
      amqp.connect(RABBITMQ_URL(), { credentials: RABBITMQ_CREDENTIALS() }, (err, conn) => {
        if (err) {
          Logger.log(`SendDurableQueue ${queueName} connect error: ${err}`);
          reject(err);
          return;
        }

        conn.createConfirmChannel((channelError, channel) => {
          if (channelError) {
            Logger.log(`SendDurableQueue ${queueName} channel error: ${channelError}`);
            conn.close();
            reject(channelError);
            return;
          }

          channel.assertQueue(queueName, { durable: true }, (assertError) => {
            if (assertError) {
              Logger.log(`SendDurableQueue ${queueName} assert error: ${assertError}`);
              conn.close();
              reject(assertError);
              return;
            }

            channel.sendToQueue(queueName, Buffer.from(JSON.stringify(msg)), {
              persistent: true,
              messageId: jobId,
              timestamp: Date.now(),
            });

            channel.waitForConfirms((confirmError) => {
              conn.close();

              if (confirmError) {
                Logger.log(`SendDurableQueue ${queueName} confirm error: ${confirmError}`);
                reject(confirmError);
                return;
              }

              Logger.log(`SendDurableQueue ${queueName} queued job ${jobId}`);
              resolve(jobId);
            });
          });
        });
      });
    });
  }

  static async ListenerReadingCurriculumToMonday() {
    this.ListenDurableQueue(QueueName.ReadingCurriculumToMonday, async (bodyData) => {
      const result = await ReadingCurriculumService.readingCurriculumToMonday(bodyData);
      if (result?.status >= 500) {
        throw new Error(result?.message || 'Reading Curriculum To Monday failed');
      }
    });
  }

  static async ListenerSessionFeedbackBinderAnalyticLogToMonday() {
    this.ListenDurableQueue(QueueName.SessionFeedbackBinderAnalyticLogToMonday, async (bodyData) => {
      const result = await SessionFeedbackBinderAnalyticLogService.sessionFeedbackBinderAnalyticLogToMonday(bodyData);
      if (result?.status >= 500) {
        throw new Error(result?.message || 'Session Feedback Binder Analytic Log To Monday failed');
      }
    });
  }

  static ListenDurableQueue(queueName, handler: (bodyData: any) => Promise<void>) {
    amqp.connect(RABBITMQ_URL(), { credentials: RABBITMQ_CREDENTIALS() }, async (err, conn) => {
      if (err) {
        Logger.log(`ListenDurableQueue ${queueName} connect error: ${err}`);
        setTimeout(() => this.ListenDurableQueue(queueName, handler), 10000);
        return;
      }

      conn.on('error', function (connError) {
        if (connError.message !== 'Connection closing') {
          Logger.log(`ListenDurableQueue ${queueName} connection error: ${connError}`);
        }
      });

      conn.on('close', () => {
        Logger.log(`ListenDurableQueue ${queueName} connection closed; reconnecting`);
        setTimeout(() => this.ListenDurableQueue(queueName, handler), 10000);
      });

      await conn.createChannel(async (channelError, channel) => {
        if (channelError) {
          Logger.log(`ListenDurableQueue ${queueName} channel error: ${channelError}`);
          conn.close();
          return;
        }

        await channel.assertQueue(queueName, { durable: true });
        channel.prefetch(1);
        Logger.log(`ListenDurableQueue ${queueName} listening`);

        await channel.consume(
          queueName,
          async (msg) => {
            if (!msg) {
              return;
            }

            const content = msg.content.toString();
            let msgEntity = null;

            try {
              msgEntity = JSON.parse(content);
              Logger.log(`ListenDurableQueue ${queueName} received job ${msgEntity?.jobId || 'unknown'}`);
              await handler(msgEntity?.bodyData);
              channel.ack(msg);
              Logger.log(`ListenDurableQueue ${queueName} completed job ${msgEntity?.jobId || 'unknown'}`);
            } catch (processError) {
              Logger.log(`ListenDurableQueue ${queueName} failed job ${msgEntity?.jobId || 'unknown'}: ${processError}`);
              channel.nack(msg, false, false);
            }
          },
          { noAck: false },
        );
      });
    });
  }

  static async ListenerSHLDeductHours() {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      async function (err, conn) {
        if (err) {
          Logger.log(`ListenerSHLDeductHours Error ${err}`);
          throw err;
        }
        Logger.log(`ListenerSHLDeductHours Connected ${err}`);

        console.log('[AMQP Receive] connected');
        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            Logger.log(`ListenerSHLDeductHours Error ${error1}`);
            throw error1;
          }
          await channel.assertQueue(QueueName.SHLDeductHours, {
            durable: false,
          });

          channel.prefetch(1);
          await channel.consume(
            QueueName.SHLDeductHours,
            async function (msg) {
              const content = msg?.content?.toString();
              console.log('SHLDeductHours received: ' + content);
              let msgEntity = content ? JSON.parse(content) : null;
              if (msgEntity) {
                if (msgEntity?.pulseId) await SHLDeductHoursService.DeductHours(msgEntity);
                channel.ack(msg);
              }
            },
            {
              noAck: false,
            },
          );

          await channel.assertQueue(QueueName.SHLDeductHoursAuto, {
            durable: false,
          });

          await channel.consume(
            QueueName.SHLDeductHoursAuto,
            async function (msg) {
              const content = msg?.content?.toString();
              console.log('SHLDeductHoursAuto received: ' + content);
              let msgEntity = content ? JSON.parse(content) : null;
              if (msgEntity) {
                const { eventData, dbData } = msgEntity;
                if (eventData?.pulseId) await SHLDeductHoursService.DeductHours(eventData, true, dbData);
                channel.ack(msg);
              }
            },
            {
              noAck: false,
            },
          );
        });
      },
    );
  }

  static async ListenerSHLAuditedRemainingHour() {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      async function (err, conn) {
        if (err) {
          Logger.log(`ListenerSHLAuditedRemainingHour Error ${err}`);
          throw err;
        }

        Logger.log('ListenerSHLAuditedRemainingHour Connected');
        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            Logger.log('Error create channel SHLAuditedRemainingHour ' + error1);
            throw error1;
          }
          await channel.assertQueue(QueueName.SHLAuditedRemainingHour, {
            durable: false,
          });

          Logger.log('Created channel SHLAuditedRemainingHour');
          channel.prefetch(1);
          await channel.consume(
            QueueName.SHLAuditedRemainingHour,
            async function (msg) {
              const content = msg?.content?.toString();
              Logger.log('SHLAuditedRemainingHour received: ' + content);
              let msgEntity = content ? JSON.parse(content) : null;
              if (msgEntity) {
                if (msgEntity?.pulseId) await SHLAuditedRemainingHourService.Run(msgEntity);
                channel.ack(msg);
              }
            },
            {
              noAck: false,
            },
          );
        });

        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            Logger.log('Error create channel SHLAuditedRemainingHourAuto ' + error1);
            throw error1;
          }

          channel.prefetch(1);
          await channel.assertQueue(QueueName.SHLAuditedRemainingHourAuto, {
            durable: false,
          });

          Logger.log('Created channel SHLAuditedRemainingHourAuto');
          await channel.consume(
            QueueName.SHLAuditedRemainingHourAuto,
            async function (msg) {
              const content = msg?.content?.toString();
              Logger.log('SHLAuditedRemainingHourAuto received: ' + content);
              let msgEntity = content ? JSON.parse(content) : null;
              if (msgEntity) {
                const { eventData, dbData } = msgEntity;
                if (eventData?.pulseId) await SHLAuditedRemainingHourService.Run(eventData, true, dbData);
                channel.ack(msg);
              }
            },
            {
              noAck: false,
            },
          );
        });
      },
    );
  }

  static async ListenerForwardWebhook() {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      async function (err, conn) {
        if (err) {
          Logger.log(`ListenerForwardWebhook Error ${err}`);
          throw err;
        }

        Logger.log('ListenerForwardWebhook Connected');
        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            Logger.log('Error create channel ListenerForwardWebhook ' + error1);
            throw error1;
          }
          await channel.assertQueue(QueueName.ForwardWebhook, {
            durable: false,
          });

          Logger.log('Created channel ListenerForwardWebhook');

          await channel.consume(
            QueueName.ForwardWebhook,
            async function (msg) {
              const content = msg?.content?.toString();
              Logger.log('ForwardWebhook received: ' + content);
              const msgEntity = content ? JSON.parse(content) : null;
              if (msgEntity) {
                const { destinationURL, event } = msgEntity;
                axios
                  .post(destinationURL, { event })
                  .then(function (response) {
                    console.log(`Sent to ${destinationURL}.`);
                  })
                  .catch(function (error) {
                    console.error(`Error ${destinationURL}: `, error);
                  });
              }
            },
            {
              noAck: true,
            },
          );
        });
      },
    );
  }

  static async ListenerSHLAddFromWS() {
    amqp.connect(
      `amqp://${process.env.RABBITMQ_URL || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}/${process.env.RABBITMQ_VHOST || 'tc'}?heartbeat=60`,
      {
        credentials: credentials.plain(process.env.RABBITMQ_USERNAME || 'dev', process.env.RABBITMQ_PASSWORD || 'Tutoringclub@321'),
      },
      async function (err, conn) {
        if (err) {
          Logger.log(`ListenerSHLAddFromWS Error ${err}`);
          throw err;
        }
        Logger.log(`ListenerSHLAddFromWS Connected ${err}`);

        console.log('[AMQP Receive] connected');
        await conn.createChannel(async function (error1, channel) {
          if (error1) {
            Logger.log(`ListenerSHLAddFromWS Error ${error1}`);
            throw error1;
          }
          await channel.assertQueue(QueueName.SHLAddFromWS, {
            durable: false,
          });

          channel.prefetch(1);
          await channel.consume(
            QueueName.SHLAddFromWS,
            async function (msg) {
              const content = msg?.content?.toString();
              console.log('SHLAddFromWS received: ' + content);
              let msgEntity = content ? JSON.parse(content) : null;
              if (msgEntity) {
                if (msgEntity?.pulseId) await SHLAddFromWSService.AddFromWS(msgEntity);
                channel.ack(msg);
              }
            },
            {
              noAck: false,
            },
          );

          // await channel.assertQueue(QueueName.SHLDeductHoursAuto, {
          //   durable: false,
          // });

          // await channel.consume(
          //   QueueName.SHLDeductHoursAuto,
          //   async function (msg) {
          //     const content = msg?.content?.toString();
          //     console.log('ListenerSHLAddFromWS received: ' + content);
          //     let msgEntity = content ? JSON.parse(content) : null;
          //     if (msgEntity) {
          //       const { eventData, dbData } = msgEntity;
          //       if (eventData?.pulseId) await SHLDeductHoursService.DeductHours(eventData, true, dbData);
          //       channel.ack(msg);
          //     }
          //   },
          //   {
          //     noAck: false,
          //   },
          // );
        });
      },
    );
  }

  static async SendQueue(queueName, msg) {
    await this.start(queueName, msg);
  }
}
