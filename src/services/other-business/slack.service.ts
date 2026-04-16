import axios, { AxiosResponse } from 'axios';

export default class SlackService {
  static async sendSlackMessage(webhookUrl, payload) {
    try {
      const response: AxiosResponse = await axios.post(webhookUrl, payload);
      console.log('Message sent to Slack:', response.data);
    } catch (error) {
      console.error('Error sending message to Slack:', error);
    }
  }

  static async tcc10(type, data) {
    const block: any = [];
    switch (type) {
      case 1: //opted out
        block.push(
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ TC Communiction - Contact Opted Out',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Contact:*\n<https://tutoringclub-stjohns.monday.com/boards/3714633203/pulses/${data?.id}|${data?.name}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Contact ID:*\n${data?.contactId}`,
              },
            ],
          },
        );

        if (data?.allStudents?.length) {
          block.push({
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Student(s):*\n${data.allStudents}`,
              },
            ],
          });
        }

        block.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '<https://us1.make.com/122345/scenarios/584602/edit|View make scenario>',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'plain_text',
              text: 'Error Code: ERR-TC-001',
              emoji: true,
            },
          },
        );
        break;
      case 2: //delivery error
        block.push(
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ ClickSend SMS Delivery Error',
              emoji: true,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'plain_text',
                text: `Error Message: ${data?.message}\n${data?.detail}`,
                emoji: true,
              },
            ],
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Contact:*\n<https://tutoringclub-stjohns.monday.com/boards/3714633203/pulses/${data?.id}|${data?.name}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Contact ID:*\n${data?.contactId}`,
              },
            ],
          },
        );

        if (data?.allStudents?.length) {
          block.push({
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Student(s):*\n${data.allStudents}`,
              },
            ],
          });
        }

        block.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '<https://us1.make.com/122345/scenarios/1499363/edit|View make scenario>',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'plain_text',
              text: 'Error Code: ERR-TC-002',
              emoji: true,
            },
          },
        );
        break;

      case 3: //clicksend success custom SMS
        block.push(
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'New SMS message in TC Communication [ClickSend]',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Contact:*\n<https://tutoringclub-stjohns.monday.com/boards/3714633203/pulses/${data?.id}|${data?.name}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Contact ID:*\n${data?.contactId}`,
              },
            ],
          },
        );

        if (data?.allStudents?.length) {
          block.push({
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Student(s):*\n${data.allStudents}`,
              },
            ],
          });
        }

        block.push({
          type: 'section',
          text: {
            type: 'plain_text',
            text: `CUSTOM SMS:\n${data.message?.replaceAll('"', '\\"')}`,
            emoji: true,
          },
        });
        break;

      case 4: //clicksend success create_update
        block.push(
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'New SMS message in TC Communication [ClickSend]',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Contact:*\n<https://tutoringclub-stjohns.monday.com/boards/3714633203/pulses/${data?.id}|${data?.name}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Contact ID:*\n${data?.contactId}`,
              },
            ],
          },
        );

        if (data?.allStudents?.length) {
          block.push({
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Student(s):*\n${data.allStudents}`,
              },
            ],
          });
        }

        block.push({
          type: 'section',
          text: {
            type: 'plain_text',
            text: `${data.message?.replaceAll('"', '\\"')}`,
            emoji: true,
          },
        });
        break;
    }

    await this.sendSlackMessage(
      type == 1 || type == 2
        ? process.env.SLACK_WEBHOOK_TCC_ALERT || ''
        : process.env.SLACK_WEBHOOK_TCC_SUCCESS || '',
      {
        blocks: block,
      },
    );
  }
}
