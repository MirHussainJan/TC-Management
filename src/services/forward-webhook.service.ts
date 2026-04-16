import QueueService  from './queue.service';
import { QueueName } from '../constants/constant-queue';
import amqp          from 'amqplib/callback_api';
import credentials   from 'amqplib/lib/credentials';
import axios from 'axios';
import Logger from '../helper/logger';

export default class ForwardWebhookService {
  static async ForwardWebhook(eventData) {
    try {
      const { destinationURL, event } = eventData;
      axios
        .post(destinationURL, { event })
        .then(function (response) {
          Logger.log(`[ForwardWebhook] Sent to ${destinationURL}.`);
          console.log(`[ForwardWebhook] Sent to ${destinationURL}.`);
        })
        .catch(function (error) {
          Logger.log(`[ForwardWebhook] Error ${error}`);
          console.error(`Error ${destinationURL}: `, error);
        });
      // await QueueService.SendQueue(QueueName.ForwardWebhook, eventData);
    } catch (error) {
      throw error;
    }
  }
}
