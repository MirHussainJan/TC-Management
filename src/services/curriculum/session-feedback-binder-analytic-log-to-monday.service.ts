import moment from 'moment';
import { BoardConstants } from '../../constants/constant';
import ConstColumn from '../../constants/constant-column';
import Logger from '../../helper/logger';
import BlabMondayService from '../blab-monday.service';
import knackService from '../knack.service';
import LogService from '../log-service';
import SlackService from '../other-business/slack.service';

const SLACK_WEBHOOK_DUPLICATE_SUBJECT = process.env.SLACK_WEBHOOK_DUPLICATE_SUBJECT || '';
const SLACK_WEBHOOK_MISSED_MINUTES = process.env.SLACK_WEBHOOK_MISSED_MINUTES || '';
const SLACK_WEBHOOK_BEHAVIOR_ALERT = process.env.SLACK_WEBHOOK_BEHAVIOR_ALERT || '';
const SLACK_WEBHOOK_FEEDBACK_NOTIF = process.env.SLACK_WEBHOOK_FEEDBACK_NOTIF || '';
const TOKEN_STABILIZE_ATTEMPTS = Number(process.env.TOKEN_STABILIZE_ATTEMPTS || 3);
const TOKEN_STABILIZE_DELAY_MS = Number(process.env.TOKEN_STABILIZE_DELAY_MS || 1200);

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumberSafe(value: any): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const cleaned = value.split(',').join('').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return parseNumberSafe(value.text);
    }

    if (typeof value.value === 'string' || typeof value.value === 'number') {
      return parseNumberSafe(value.value);
    }
  }

  return 0;
}

function extractSafeTokenValues(record: any) {
  const tokensEarned = Math.max(0, parseNumberSafe(record?.field_245 ?? record?.field_245_raw));
  const tokensSpent = Math.max(0, parseNumberSafe(record?.field_242 ?? record?.field_242_raw));
  const rawTokenTotal = parseNumberSafe(record?.field_1016 ?? record?.field_1016_raw);
  const derivedTokenTotal = tokensEarned - tokensSpent;
  const tokenTotal = Math.max(0, rawTokenTotal >= 0 ? rawTokenTotal : derivedTokenTotal);

  return {
    tokensEarned,
    tokensSpent,
    tokenTotal,
  };
}

async function getStabilizedFeedbackLogRecord(recordId: string, initialRecord: any) {
  let latestRecord = initialRecord;
  let lastTokens = extractSafeTokenValues(initialRecord);

  for (let i = 0; i < TOKEN_STABILIZE_ATTEMPTS; i++) {
    await wait(TOKEN_STABILIZE_DELAY_MS);

    const fetched = await knackService.getRecord('object_29', recordId);
    if (!fetched?.id) {
      continue;
    }

    const currentTokens = extractSafeTokenValues(fetched);
    const isStable =
      currentTokens.tokensEarned === lastTokens.tokensEarned &&
      currentTokens.tokensSpent === lastTokens.tokensSpent &&
      currentTokens.tokenTotal === lastTokens.tokenTotal;

    latestRecord = fetched;
    if (isStable) {
      return latestRecord;
    }

    lastTokens = currentTokens;
  }

  return latestRecord;
}

function getMondayId(value: any) {
  if (!value) {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = String(value).trim();
    return parsed.length ? parsed : null;
  }

  if (typeof value === 'object') {
    return getMondayId(value.id || value.text || value.value);
  }

  return null;
}

async function ensureSessionFeedbackItem(feedbackLogRecord: any, studentRecords: any, itemName: string, columnValues: any) {
  const existingMondayItemId = getMondayId(feedbackLogRecord.field_1710);
  if (existingMondayItemId) {
    Logger.log(`Session Feedback Log item already exists for feedback log ${feedbackLogRecord.id}: ${existingMondayItemId}`);
    return existingMondayItemId;
  }

  const existingItems = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SessionFeedbackLog, [
    { column_id: ConstColumn.SessionFeedbackLog.StudentName, column_values: [feedbackLogRecord.field_239_raw?.[0]?.identifier] },
    { column_id: ConstColumn.SessionFeedbackLog.Date, column_values: [moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD')] },
  ]);
  const existingItem = existingItems?.find((item) => item.name === itemName);

  if (existingItem?.id) {
    Logger.log(`Session Feedback Log item found by name/date for feedback log ${feedbackLogRecord.id}: ${existingItem.id}`);
    await knackService.updateRecord('object_29', feedbackLogRecord.id, {
      field_1710: existingItem.id,
      field_1711: {
        url: `https://tutoringclub-stjohns.monday.com/boards/4911698347/views/152869316/pulses/${existingItem.id}`,
        label: `https://tutoringclub-stjohns.monday.com/boards/4911698347/views/152869316/pulses/${existingItem.id}`,
      },
      field_1715: columnValues[ConstColumn.SessionFeedbackLog.SessionNumber],
      field_1820: 'Submission Successful',
    });
    return existingItem.id;
  }

  const createdItemId = await BlabMondayService.CreateItemWithValues(BoardConstants.SessionFeedbackLog, itemName, columnValues);
  await knackService.updateRecord('object_29', feedbackLogRecord.id, {
    field_1710: createdItemId,
    field_1711: {
      url: `https://tutoringclub-stjohns.monday.com/boards/4911698347/views/152869316/pulses/${createdItemId}`,
      label: `https://tutoringclub-stjohns.monday.com/boards/4911698347/views/152869316/pulses/${createdItemId}`,
    },
    field_1715: columnValues[ConstColumn.SessionFeedbackLog.SessionNumber],
    field_1820: 'Submission Successful',
  });
  return createdItemId;
}

async function ensureAlertFeedbackItem(feedbackLogRecord: any, itemName: string, columnValues: any) {
  const existingItems = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SessionFeedbackLog, [
    { column_id: ConstColumn.SessionFeedbackLog.Date, column_values: [moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD')] },
  ]);
  const existingItem = existingItems?.find((item) => item.name === itemName);

  if (existingItem?.id) {
    Logger.log(`Alert Session Feedback Log item found by name/date for feedback log ${feedbackLogRecord.id}: ${existingItem.id}`);
    return existingItem.id;
  }

  return BlabMondayService.CreateItemWithValues(BoardConstants.SessionFeedbackLog, itemName, columnValues);
}

async function ensureBinderAnalyticsSubitem(feedbackLogRecord: any, binder: any, subitemName: string, columnValues: any) {
  const existingMondaySubitemId = getMondayId(feedbackLogRecord.field_1712);
  if (existingMondaySubitemId) {
    Logger.log(`Binder Analytics subitem already exists for feedback log ${feedbackLogRecord.id}: ${existingMondaySubitemId}`);
    return existingMondaySubitemId;
  }

  const binderWithSubitems = await BlabMondayService.GetItemById(binder.id, [], false, false, true);
  const existingSubitem = binderWithSubitems?.subitems?.find((subitem) => subitem.name === subitemName);

  if (existingSubitem?.id) {
    Logger.log(`Binder Analytics subitem found by name for feedback log ${feedbackLogRecord.id}: ${existingSubitem.id}`);
    await knackService.updateRecord('object_29', feedbackLogRecord.id, {
      field_1712: existingSubitem.id,
      field_1713: {
        url: `https://tutoringclub-stjohns.monday.com/boards/5714515483/pulses/${existingSubitem.id}`,
        label: `https://tutoringclub-stjohns.monday.com/boards/5714515483/pulses/${existingSubitem.id}`,
      },
    });
    return existingSubitem.id;
  }

  const createdSubitemId = await BlabMondayService.CreateSubitemWithValues(binder.id, subitemName, columnValues);
  await knackService.updateRecord('object_29', feedbackLogRecord.id, {
    field_1712: createdSubitemId,
    field_1713: {
      url: `https://tutoringclub-stjohns.monday.com/boards/5714515483/pulses/${createdSubitemId}`,
      label: `https://tutoringclub-stjohns.monday.com/boards/5714515483/pulses/${createdSubitemId}`,
    },
  });
  return createdSubitemId;
}

export async function sessionFeedbackBinderAnalyticLogToMonday(bodyData) {
  let status = 200;
  let message = 'Session feedback binder analytic log processed successfully';
  let logData = {
    board_id: 0,
    item_id: 0,
    item_name: bodyData.id,
    board_name: '',
    event_name: 'Session Feedback Binder Analytic Log To Monday',
    event_data: bodyData,
    monday_item_id: 0,
  };
  const { mondayLog } = await LogService.StartLog(logData);
  let result;
  try {
    result = { msg: `sessionFeedbackBinderAnalyticLogToMonday executed` };
    // for (const record of bodyData?.records) {
    let feedbackLogRecord = await knackService.getRecord('object_29', bodyData.id);
    feedbackLogRecord = await getStabilizedFeedbackLogRecord(feedbackLogRecord.id, feedbackLogRecord);
    const safeTokenValues = extractSafeTokenValues(feedbackLogRecord);

    const studentRecords = await knackService.getRecords('object_1', {
      filters: { match: 'and', rules: [{ field: ConstColumn.Knack.Students.RecordId, operator: 'is', value: feedbackLogRecord.field_1328 }] },
    });

    //Duplicate Found
    if (feedbackLogRecord.field_1021?.length > 0 && feedbackLogRecord.field_1021 === feedbackLogRecord.field_1585 && studentRecords?.records?.length > 0) {
      result = { msg: `Duplicate found` };
      const studentDatabaseMonday = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SD, [
        { column_id: `${ConstColumn.SD.StudentID}`, column_values: [feedbackLogRecord.field_1080_raw] },
      ]);
      const rs = studentDatabaseMonday?.[0]?.column_values?.filter((s) => s.id === ConstColumn.SD.NumberOfSession)?.[0];

      const sessionNumber = rs?.text;
      await knackService.updateRecord('object_29', feedbackLogRecord.id, {
        field_1715: Number(sessionNumber) + Number(studentRecords?.records?.[0]?.field_1709),
        field_1820: 'Duplicate Subject',
      });

      const getAccounts = await knackService.getRecord('object_2', feedbackLogRecord.field_936_raw?.[0]?.id);
      if (getAccounts?.id) {
        //TODO need slack api token to search User by email
        const slackUser = { id: 123 };

        //not found
        // await SlackService.sendSlackMessage(
        //   '<redacted-webhook-url>',
        //   `{
        //     	"blocks": [
        //     		{
        //     			"type": "section",
        //     			"text": {
        //     				"type": "mrkdwn",
        //     				"text": "*:bangbang: Duplicate Subject Found on Feedback Log *\n\nHello ${feedbackLogRecord.field_936_raw?.[0]?.identifier},\nThe feedback log you submitted *has not* been successfully logged due to duplicate subjects found.\n\nStudent: ${feedbackLogRecord.field_239_raw?.[0]?.identifier}\nSubjects Selected: ${feedbackLogRecord.field_1698}\n\nKindly click on the button below to edit and re-submit the feedback log."
        //     			}
        //     		},
        //     		{
        //     			"type": "actions",
        //     			"elements": [
        //     				{
        //     					"type": "button",
        //     					"text": {
        //     						"type": "plain_text",
        //     						"text": "Edit and Re-submit",
        //     						"emoji": true
        //     					},
        //     					"style": "primary",
        //     					"value": "https://tutoringclubstj.knack.com/tutoring-club#feedback-log/edit-feedback-log/${feedbackLogRecord.id}/",
        //     					"url": "https://tutoringclubstj.knack.com/tutoring-club#feedback-log/edit-feedback-log/${feedbackLogRecord.id}/",
        //     					"action_id": "button-action"
        //     				}
        //     			]
        //     		}
        //     	]
        //     }`,
        // );

        //found the usser
        // await SlackService.sendSlackMessage(
        //   '<redacted-webhook-url>',
        //   `{
        //     	"blocks": [
        //     		{
        //     			"type": "section",
        //     			"text": {
        //     				"type": "mrkdwn",
        //     				"text": "*:bangbang: Duplicate Subject Found on Feedback Log *\n\nHello <${slackUser?.id}>,\nThe feedback log you submitted *has not* been successfully logged due to duplicate subjects found.\n\nStudent: ${feedbackLogRecord.field_239_raw?.[0]?.identifier}\nSubjects Selected: ${feedbackLogRecord.field_1698}\n\nKindly click on the button below to edit and re-submit the feedback log."
        //     			}
        //     		},
        //     		{
        //     			"type": "actions",
        //     			"elements": [
        //     				{
        //     					"type": "button",
        //     					"text": {
        //     						"type": "plain_text",
        //     						"text": "Edit and Re-submit",
        //     						"emoji": true
        //     					},
        //     					"style": "primary",
        //     					"value": "https://tutoringclubstj.knack.com/tutoring-club#feedback-log/edit-feedback-log/${feedbackLogRecord.id}/",
        //     					"url": "https://tutoringclubstj.knack.com/tutoring-club#feedback-log/edit-feedback-log/${feedbackLogRecord.id}/",
        //     					"action_id": "button-action"
        //     				}
        //     			]
        //     		}
        //     	]
        //     }`,
        // );
      }
    } else {
      result = { msg: `No Duplicates found` };

      const previousFeedback = feedbackLogRecord.field_926_raw?.replaceAll('[]', '') || '0';
      //Session Details
      if (!feedbackLogRecord.field_1079 || feedbackLogRecord.field_1079?.includes('Session') || feedbackLogRecord.field_1079?.includes('Worklog')) {
        if (feedbackLogRecord.field_1523?.includes('Yes') || feedbackLogRecord.field_1523?.includes('No')) {
          const user = await BlabMondayService.GetUsersByEmail(feedbackLogRecord.field_1285_raw);
          const searchSD = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SD, [
            { column_id: `${ConstColumn.SD.StudentID}`, column_values: [feedbackLogRecord.field_1080_raw] },
          ]);

          const sessionNumber = searchSD?.[0]?.column_values?.filter((s) => s.id === ConstColumn.SD.NumberOfSession)?.[0]?.text || '0';
          const subjectobj =
            `${feedbackLogRecord.field_1021}${feedbackLogRecord.field_1585?.length ? ',' + feedbackLogRecord.field_1585 : ''}${feedbackLogRecord.field_1566?.length ? ',' + feedbackLogRecord.field_1566 : ''}`
              ?.split(',')
              ?.map((s) => s.trim()) || [];
          let createColumnValues = {
            [ConstColumn.SessionFeedbackLog.Center]: feedbackLogRecord.field_1283_raw || null,
            [ConstColumn.SessionFeedbackLog.StudentName]: feedbackLogRecord.field_239_raw?.[0]?.identifier,
            [ConstColumn.SessionFeedbackLog.Date]: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD') || null,
            [ConstColumn.SessionFeedbackLog.Effort]: feedbackLogRecord.field_918 ? { rating: Math.round(feedbackLogRecord.field_918) } : null,
            [ConstColumn.SessionFeedbackLog.Understanding]: feedbackLogRecord.field_919 ? { rating: Math.round(feedbackLogRecord.field_919) } : null,
            [ConstColumn.SessionFeedbackLog.Behavior]: feedbackLogRecord.field_1468 ? { rating: Math.round(feedbackLogRecord.field_1468) } : null,
            [ConstColumn.SessionFeedbackLog.StudentStatus]: feedbackLogRecord.field_1284 || null,
            [ConstColumn.SessionFeedbackLog.FeedbackAlert]: previousFeedback?.replaceAll('<br />', '')?.replaceAll('"', "'") || null,
            [ConstColumn.SessionFeedbackLog.TokensEarned]: safeTokenValues.tokensEarned,
            [ConstColumn.SessionFeedbackLog.TokensSpent]: safeTokenValues.tokensSpent,
            [ConstColumn.SessionFeedbackLog.TokenTotal]: safeTokenValues.tokenTotal,
            [ConstColumn.SessionFeedbackLog.ItemPurchased]: feedbackLogRecord.field_250 || null,
            [ConstColumn.SessionFeedbackLog.BehaviorReason]: feedbackLogRecord.field_1469?.replaceAll('<br />', '')?.replaceAll('"', "'") || null,
            [ConstColumn.SessionFeedbackLog.FeedbackType]: feedbackLogRecord.field_1636 || null,
            [ConstColumn.SessionFeedbackLog.ReducedSession]: feedbackLogRecord.field_1567 || null,
            [ConstColumn.SessionFeedbackLog.RecordEndOfSession]: 'Yes',
            [ConstColumn.SessionFeedbackLog.WorkedOnSchoolwork]: feedbackLogRecord.field_1761 || null,
            [ConstColumn.SessionFeedbackLog.SessionNumber]: Number(studentRecords?.records?.[0]?.field_1709) + Number(sessionNumber),
            [ConstColumn.SessionFeedbackLog.SchoolworkStatus]: feedbackLogRecord.field_1762 || null,
            [ConstColumn.SessionFeedbackLog.SchoolworkAleartMessage]: feedbackLogRecord.field_1763,
            [ConstColumn.SessionFeedbackLog.TotalInputSessionTime]: Number(feedbackLogRecord.field_1800 || 0),
            // [ConstColumn.SessionFeedbackLog.Type]: feedbackLogRecord.field_1026,
            // [ConstColumn.SessionFeedbackLog.TutorNote]: feedbackLogRecord.field_1037,
            [ConstColumn.SessionFeedbackLog.Subject]: { labels: subjectobj },
          };
          if (user?.id) {
            createColumnValues[ConstColumn.SessionFeedbackLog.Tutor] = { personsAndTeams: [{ id: user.id, kind: 'person' }] };
          }
          const itemName = `${feedbackLogRecord.field_239_raw?.[0]?.identifier}${feedbackLogRecord.field_240?.length ? ' - ' + feedbackLogRecord.field_240 : ''}${feedbackLogRecord.field_1021?.length ? ' - ' + feedbackLogRecord.field_1021 : ''}${feedbackLogRecord.field_1585?.length > 0 ? ' - ' + feedbackLogRecord.field_1585 : ''}${feedbackLogRecord.field_1566?.length > 0 ? ', ' + feedbackLogRecord.field_1566 : ''}`;
          const rs = await ensureSessionFeedbackItem(feedbackLogRecord, studentRecords, itemName, createColumnValues);
          console.log('Created feedback log in Monday for feedback log ID ', feedbackLogRecord.id);
          result = { msg: `Session Feedback Log item processed in Monday for feedback log ID ${feedbackLogRecord.id}: ${rs}` };
        }
      }

      //Missed minutes
      if (feedbackLogRecord.field_1628 && feedbackLogRecord.field_1628 > 60) {
        result = { msg: `Sending Slack Message for Missed Minutes` };
        if (SLACK_WEBHOOK_MISSED_MINUTES) {
          await SlackService.sendSlackMessage(
            SLACK_WEBHOOK_MISSED_MINUTES,
            `{
            	"blocks": [
            		{
            			"type": "section",
            			"text": {
            				"type": "mrkdwn",
            				"text": "${feedbackLogRecord.field_239_raw?.[0]?.identifier} has missed ${feedbackLogRecord.field_1628} minutes due to arriving late or leaving early. Please send this   family an SMS           Template for too much missed time."
            			}
            		},
            		{
            			"type": "divider"
            		}
            	]
            }`,
          );
        }
      }

      //Alert
      if (
        feedbackLogRecord.field_1079?.length > 0 &&
        feedbackLogRecord.field_1079 !== 'Session' &&
        feedbackLogRecord.field_1079 !== 'Worklog' &&
        (feedbackLogRecord.field_1079?.includes('Tutor Note') ||
          feedbackLogRecord.field_1079?.includes('Urgent Alert') ||
          feedbackLogRecord.field_1079?.includes('Alert from Leadership'))
      ) {
        const user = await BlabMondayService.GetUsersByEmail(feedbackLogRecord.field_1285_raw);
        const subjectobj =
          `${feedbackLogRecord.field_1021}${feedbackLogRecord.field_1585?.length ? ',' + feedbackLogRecord.field_1585 : ''}${feedbackLogRecord.field_1566?.length ? ',' + feedbackLogRecord.field_1566 : ''}`
            ?.split(',')
            ?.map((s) => s.trim()) || [];
        let createColumnValues = {
          [ConstColumn.SessionFeedbackLog.Center]: feedbackLogRecord.field_1283_raw,
          [ConstColumn.SessionFeedbackLog.StudentName]: feedbackLogRecord.field_239_raw?.[0]?.identifier,
          [ConstColumn.SessionFeedbackLog.Date]: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
          [ConstColumn.SessionFeedbackLog.Effort]: feedbackLogRecord.field_918 ? { rating: Math.round(feedbackLogRecord.field_918) } : null,
          [ConstColumn.SessionFeedbackLog.Understanding]: feedbackLogRecord.field_919 ? { rating: Math.round(feedbackLogRecord.field_919) } : null,
          [ConstColumn.SessionFeedbackLog.StudentStatus]: feedbackLogRecord.field_1284,
          [ConstColumn.SessionFeedbackLog.FeedbackAlert]: feedbackLogRecord.field_1037,
          [ConstColumn.SessionFeedbackLog.Type]: feedbackLogRecord.field_1026,
          [ConstColumn.SessionFeedbackLog.TutorNote]: feedbackLogRecord.field_1037,
          [ConstColumn.SessionFeedbackLog.Subject]: { labels: subjectobj },
        };
        if (user?.id) {
          createColumnValues[ConstColumn.SessionFeedbackLog.Tutor] = { personsAndTeams: [{ id: user.id, kind: 'person' }] };
        } else {
          createColumnValues[ConstColumn.SessionFeedbackLog.TokensEarned] = safeTokenValues.tokensEarned;
          createColumnValues[ConstColumn.SessionFeedbackLog.TokensSpent] = safeTokenValues.tokensSpent;
          createColumnValues[ConstColumn.SessionFeedbackLog.TokenTotal] = safeTokenValues.tokenTotal;
        }

        const alertItemName = `${feedbackLogRecord.field_1026}${feedbackLogRecord.field_239_raw?.[0]?.identifier?.length ? ' - ' + feedbackLogRecord.field_239_raw?.[0]?.identifier : ''}${studentRecords?.records?.[0]?.field_497_raw?.timestamp?.length ? ' - ' + moment(studentRecords?.records?.[0]?.field_497_raw?.timestamp).format('MM/DD/YYYY') : ''}${feedbackLogRecord.field_1021?.length ? ' - ' + feedbackLogRecord.field_1021 : ''}`;
        const rs = await ensureAlertFeedbackItem(feedbackLogRecord, alertItemName, createColumnValues);
        console.log('Alert created in Monday for feedback log ID ', feedbackLogRecord);
        result = { msg: `Alert processed in Monday for feedback log ID ${feedbackLogRecord.id}: ${rs}` };
      }

      //Slack Notif
      const subject = `${feedbackLogRecord.field_1021}${feedbackLogRecord.field_1585?.length ? ', ' + feedbackLogRecord.field_1585 : ''}${feedbackLogRecord.field_1566?.length ? ', ' + feedbackLogRecord.field_1566 : ''}`;
      //Behavior stars is equal to 2 or less
      if (feedbackLogRecord.field_1468 <= 2.5) {
        if (SLACK_WEBHOOK_BEHAVIOR_ALERT) {
          await SlackService.sendSlackMessage(
            SLACK_WEBHOOK_BEHAVIOR_ALERT,
            `{
            	"blocks": [
            		{
            			"type": "section",
            			"text": {
            				"type": "mrkdwn",
            				"text": "*Behavior Alert ❗❗❗* \n${moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('MM/DD/YYYY')} - ${subject}\n\n${feedbackLogRecord.field_239_raw?.[0]?.identifier} had a behavioral rating of ${feedbackLogRecord.field_1468}\n\nTutor: ${feedbackLogRecord.field_936_raw?.[0]?.identifier}\n\nReason: ${feedbackLogRecord.field_1469}\n\nSession Feedback: ${previousFeedback?.replaceAll('<br />', '\n')}"
            			}
            		},
            		{
            			"type": "divider"
            		}
            	]
            }`,
          );
        }
        //Post to Slack and behavioural stars of less than 2
        if (feedbackLogRecord.field_1489?.includes('Yes')) {
          if (SLACK_WEBHOOK_FEEDBACK_NOTIF) {
            await SlackService.sendSlackMessage(
              SLACK_WEBHOOK_FEEDBACK_NOTIF,
              `{
              	"blocks": [
              		{
              			"type": "section",
              			"text": {
              				"type": "mrkdwn",
              				"text": "*${moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('MM/DD/YYYY')} - ${subject}*\nStudent: ${feedbackLogRecord.field_239_raw?.[0]?.identifier}\n\nSession Feedback: ${feedbackLogRecord.field_921?.replaceAll('"', "'")}\n\nEffort: ${feedbackLogRecord.field_918_raw}/5.0\nUnderstanding: ${feedbackLogRecord.field_919_raw}/5.0\nBehavior: ${feedbackLogRecord.field_1468_raw}/5.0\n\nTutor: ${feedbackLogRecord.field_936_raw?.[0]?.identifier}\n\nReason for behavior: ${feedbackLogRecord.field_1469}\n\nSession Feedback: ${previousFeedback?.replaceAll('<br />', '\n')}"
              			}
              		},
              		{
              			"type": "divider"
              		}
              	]
              }`,
            );
          }
        }
      } else if (feedbackLogRecord.field_1489?.includes('Yes')) {
        //Post to Slack and behavioural stars of more than 2
        if (SLACK_WEBHOOK_FEEDBACK_NOTIF) {
          await SlackService.sendSlackMessage(
            SLACK_WEBHOOK_FEEDBACK_NOTIF,
            `{
              	"blocks": [
              		{
              			"type": "section",
              			"text": {
              				"type": "mrkdwn",
              				"text": "*${moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('MM/DD/YYYY')} - ${subject}*\nStudent: ${feedbackLogRecord.field_239_raw?.[0]?.identifier}\n\nSession Feedback: ${feedbackLogRecord.field_921?.replaceAll('"', "'")}\n\nEffort: ${feedbackLogRecord.field_918_raw}/5.0\nUnderstanding: ${feedbackLogRecord.field_919_raw}/5.0\nBehavior: ${feedbackLogRecord.field_1468_raw}/5.0\n\nTutor: ${feedbackLogRecord.field_936_raw?.[0]?.identifier}\n\nSession Feedback: ${previousFeedback?.replaceAll('<br />', '\n')}"
              			}
              		},
              		{
              			"type": "divider"
              		}
              	]
              }`,
          );
        }
      }

      //Binder Analytics
      if (
        feedbackLogRecord.field_1523?.includes('Yes') &&
        (!feedbackLogRecord.field_1079 || feedbackLogRecord.field_1079?.includes('Session') || feedbackLogRecord.field_1079?.includes('Worklog'))
      ) {
        result = { msg: `Checking Binder Analytics for feedback log ID ${feedbackLogRecord.id}` };
        const binderAnalytics = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.BinderAnalyticsData, [
          { column_id: `${ConstColumn.BinderAnalyticsData.StudentId}`, column_values: [feedbackLogRecord.field_1080] },
        ]);

        if (binderAnalytics?.length > 0) {
          const binder = binderAnalytics[0];
          result = { msg: `Found Binder Analytics for feedback log ID ${feedbackLogRecord.id}` };
          const studentDatabase = await BlabMondayService.GetItemsPageByColumnValues(BoardConstants.SD, [
            { column_id: `${ConstColumn.SD.StudentID}`, column_values: [feedbackLogRecord.field_1080_raw] },
          ]);

          result = { msg: `studentDatabase fetched for feedback log ID ${feedbackLogRecord.id}` };

          for (const student of studentDatabase) {
            const numberOfSession = student.column_values.filter((c) => c.id === ConstColumn.SD.NumberOfSession)?.[0]?.text;
            const subitemName = `${Number(numberOfSession) + Number(studentRecords.records?.[0]?.field_1709)} - ${feedbackLogRecord.field_1022_raw?.date} - ${subject}`;
            const resultCreateSubitem = await ensureBinderAnalyticsSubitem(feedbackLogRecord, binder, subitemName, {
              [ConstColumn.BinderAnalyticsData.TotalTimeTimeMissed]: Number(feedbackLogRecord.field_1800_raw || 0),
            });

            result = { msg: `resultCreateSubitem ${JSON.stringify(resultCreateSubitem)}` };
            result = { msg: `Binder Analytics Subitem processed in Monday for feedback log ID ${feedbackLogRecord.id}` };
            result = { msg: `Updated Binder Analytics fields in Knack for feedback log ID ${feedbackLogRecord.id}` };
            //Add Subject
            await BlabMondayService.ChangeSimpleColumnValue(6311984142, resultCreateSubitem, 'subjects', subject);
            result = { msg: `Added Subject to Binder Analytics Subitem in Monday for feedback log ID ${feedbackLogRecord.id}` };

            //Total Token
            await BlabMondayService.ChangeSimpleColumnValue(
              BoardConstants.BinderAnalyticsData,
              binder.id,
              ConstColumn.BinderAnalyticsData.TotalTokens,
              safeTokenValues.tokenTotal,
            );
            result = { msg: `Updated Total Tokens in Binder Analytics in Monday for feedback log ID ${feedbackLogRecord.id}` };

            //Change Maths to Math
            const studentKnack = await knackService.getRecords('object_1', {
              filters: { match: 'and', rules: [{ field: ConstColumn.Knack.Students.RecordId, operator: 'is', value: feedbackLogRecord.field_1328 }] },
            });
            const studentKnackRecords = studentKnack?.records;
            for (const student of studentKnackRecords) {
              const identifiers = student.field_1313_raw?.map((s) => s.identifier) || [];
              const identifiersString = identifiers.join(', ');
              if (identifiers.includes('Maths')) {
                const updatedSubjects = identifiersString?.replaceAll('Maths', 'Math');
                await BlabMondayService.ChangeSimpleColumnValue(6311984142, resultCreateSubitem, 'dup__of_subjects__1', updatedSubjects);
                result = { msg: `Changed Maths to Math in Binder Analytics Subitem in Monday for feedback log ID ${feedbackLogRecord.id}` };
              }
            }
            //Total Number of Minutes Missed/Session Number
            await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
              numbers__1: Number(feedbackLogRecord.field_1628 || 0),
              numbers: Number(numberOfSession) + Number(studentRecords.records?.[0]?.field_1709 || 0),
              date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
              color: feedbackLogRecord.field_1567,
            });

            //Binder Exists
            // const subject1 = `${feedbackLogRecord.field_1021} & ${feedbackLogRecord.field_1563}`;
            // const subject2 = `${feedbackLogRecord.field_1585} & ${feedbackLogRecord.field_1564}`;
            // const subject3 = `${feedbackLogRecord.field_1566} & ${feedbackLogRecord.field_1565}`;
            //Math and Math Facts Curriculum
            if (feedbackLogRecord.field_1021 == 'Math' || feedbackLogRecord.field_1585 == 'Math' || feedbackLogRecord.field_1566 == 'Math') {
              const searchMathCurriculum = await knackService.getRecords('object_38', {
                filters: {
                  match: 'and',
                  rules: [
                    { field: 'field_342', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                    { field: 'field_1699', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                    { field: 'field_1648', operator: 'is', value: feedbackLogRecord.id },
                  ],
                },
              });

              const lessonCalculationTotal = (searchMathCurriculum.records || [])?.reduce((total, record) => {
                if (record.field_480_raw != null) return total + 1;
                if (record.field_479_raw != null) return total + 0.67;
                return total + 0.33;
              }, 0);
              result = { msg: `Total Lesson Calculation for Math: ${lessonCalculationTotal}` };

              // const feedbackLogBinderExists = await knackService.getRecords('object_29', {
              //   sort_field: 'field_238',
              //   sort_order: 'desc',
              //   filters: {
              //     match: 'or',
              //     rules: [
              //       { field: 'field_1021', operator: 'is', value: feedbackLogRecord.field_1021 },
              //       { field: 'field_1585', operator: 'is', value: feedbackLogRecord.field_1585 },
              //       { field: 'field_1566', operator: 'is', value: feedbackLogRecord.field_1566 },
              //     ],
              //   },
              // });

              // const count =
              //   feedbackLogBinderExists?.records?.filter(
              //     (s) => s.field_1022_raw?.date == feedbackLogRecord.field_1022_raw?.date && s.field_239_raw?.id == feedbackLogRecord.field_239_raw?.id,
              //   )?.length || 0;

              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                time_on_math: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                __math_lessons: lessonCalculationTotal == 0.99 ? 1 : lessonCalculationTotal,
                dup__of___math_lessons__1: 1,
              });
            }
            //Math and Math Facts Curriculum
            if (feedbackLogRecord.field_1021 == 'Math Facts' || feedbackLogRecord.field_1585 == 'Math Facts' || feedbackLogRecord.field_1566 == 'Math Facts') {
              // const mathFactsCurriculum = await knackService.getRecords('object_43', {
              //   filters: {
              //     match: 'and',
              //     rules: [
              //       { field: 'field_511', operator: 'is', value: 'Completed' },
              //       { field: 'field_519', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
              //       { field: 'field_507', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
              //       { field: 'field_1363', operator: 'is', value: feedbackLogRecord.id },
              //     ],
              //   },
              // });

              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                time_on_math: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
              });
              result = { msg: `Updated Math Facts in Binder Analytics Subitem in Monday for feedback log ID ${feedbackLogRecord.id}` };
            }
            //Reading Curriculum
            if (feedbackLogRecord.field_1021 == 'Reading' || feedbackLogRecord.field_1585 == 'Reading' || feedbackLogRecord.field_1566 == 'Reading') {
              const searchReadingCurriculum = await knackService.getRecords('object_50', {
                filters: {
                  match: 'and',
                  rules: [
                    {
                      field: 'field_735',
                      operator: 'is not blank',
                      value: '',
                    },
                    { field: 'field_727', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                    { field: 'field_728', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                    { field: 'field_1647', operator: 'is', value: feedbackLogRecord.id },
                  ],
                },
              });

              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                __reading_lessons: Number(searchReadingCurriculum?.records?.length),
                numeric: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                numbers9__1: 1,
              });
              result = { msg: `Updated Reading in Binder Analytics Subitem in Monday for feedback log ID ${feedbackLogRecord.id}` };
            }

            //Writing, Handwriting Curriculum
            if (
              feedbackLogRecord.field_1021 == 'Writing' ||
              feedbackLogRecord.field_1585 == 'Writing' ||
              feedbackLogRecord.field_1566 == 'Writing' ||
              feedbackLogRecord.field_1021 == 'Handwriting' ||
              feedbackLogRecord.field_1585 == 'Handwriting' ||
              feedbackLogRecord.field_1566 == 'Handwriting'
            ) {
              const sub = `${feedbackLogRecord.field_1021}, ${feedbackLogRecord.field_1585}, ${feedbackLogRecord.field_1566}`;
              if (sub.includes('Writing') && sub.includes('Handwriting')) {
                const searchWritingCurriculum = await knackService.getRecords('object_46', {
                  filters: {
                    match: 'and',
                    rules: [
                      {
                        field: 'field_1004',
                        operator: 'is',
                        value: 'Completed',
                      },
                      { field: 'field_586', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                      { field: 'field_587', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                      { field: 'field_595', operator: 'does not contain', value: 'Test' },
                      { field: 'field_1365', operator: 'is', value: feedbackLogRecord.id },
                    ],
                  },
                });
                await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                  date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                  color: feedbackLogRecord.field_1567,
                  __writing_lessons: Number(searchWritingCurriculum?.records?.length) + 1,
                  time_on_writing: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                  numbers0__1: 1,
                });
              }
              if (sub.includes('Writing') && !sub.includes('Handwriting')) {
                const searchWritingCurriculum = await knackService.getRecords('object_46', {
                  filters: {
                    match: 'and',
                    rules: [
                      {
                        field: 'field_1004',
                        operator: 'is',
                        value: 'Completed',
                      },
                      { field: 'field_586', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                      { field: 'field_587', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                      { field: 'field_595', operator: 'does not contain', value: 'Test' },
                      { field: 'field_1365', operator: 'is', value: feedbackLogRecord.id },
                    ],
                  },
                });
                await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                  date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                  color: feedbackLogRecord.field_1567,
                  __writing_lessons: Number(searchWritingCurriculum?.records?.length) + 1,
                  time_on_writing: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                  numbers0__1: 1,
                });
              }
              if (sub.includes('Handwriting') && !sub.includes('Writing')) {
                await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                  date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                  color: feedbackLogRecord.field_1567,
                  __writing_lessons: 1,
                  time_on_writing: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                  numbers0__1: 1,
                });
              }
            }

            //Word Attack
            if (
              feedbackLogRecord.field_1021 == 'Word Attack' ||
              feedbackLogRecord.field_1585 == 'Word Attack' ||
              feedbackLogRecord.field_1566 == 'Word Attack'
            ) {
              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                numbers3__1: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
              });
            } else {
              //Tutor up

              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                time_on_tu: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                numbers14__1: 1,
              });
            }

            //ACT, SAT Curriculum
            if (feedbackLogRecord.field_1021 == 'ACT' || feedbackLogRecord.field_1585 == 'ACT' || feedbackLogRecord.field_1566 == 'ACT') {
              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                time_on_sat: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                __sat_lessons: 1,
              });
            }
            if (feedbackLogRecord.field_1021 == 'SAT' || feedbackLogRecord.field_1585 == 'SAT' || feedbackLogRecord.field_1566 == 'SAT') {
              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                time_on_act: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                __act_lessons: 1,
              });
            }

            //BR-Letters and Sounds, BR-Phonics, UFLI Curriculum
            if (
              feedbackLogRecord.field_1021 == 'BR-Letters and Sounds' ||
              feedbackLogRecord.field_1585 == 'BR-Letters and Sounds' ||
              feedbackLogRecord.field_1566 == 'BR-Letters and Sounds' ||
              feedbackLogRecord.field_1021 == 'BR-Phonics' ||
              feedbackLogRecord.field_1585 == 'BR-Phonics' ||
              feedbackLogRecord.field_1566 == 'BR-Phonics' ||
              feedbackLogRecord.field_1021 == 'UFLI' ||
              feedbackLogRecord.field_1585 == 'UFLI' ||
              feedbackLogRecord.field_1566 == 'UFLI'
            ) {
              const combinedSubjects = `${feedbackLogRecord.field_1021}, ${feedbackLogRecord.field_1585}, ${feedbackLogRecord.field_1566}`;
              if (combinedSubjects?.includes('BR-Phonics') || combinedSubjects?.includes('UFLI')) {
                if (combinedSubjects?.includes('Phonics') && combinedSubjects?.includes('UFLI')) {
                  const searchLetterSoundPhonic = await knackService.getRecords('object_54', {
                    filters: {
                      match: 'and',
                      rules: [
                        {
                          field: 'field_1119',
                          operator: 'is',
                          value: 'Completed',
                        },
                        { field: 'field_1269', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                        { field: 'field_1120', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                        { field: 'field_1166', operator: 'is', value: 'Phonics' },
                        { field: 'field_1367', operator: 'is', value: feedbackLogRecord.id },
                      ],
                    },
                  });
                  const searchUFLICurriculum = await knackService.getRecords('object_60', {
                    filters: {
                      match: 'and',
                      rules: [
                        {
                          field: 'field_1414',
                          operator: 'is',
                          value: 'Completed',
                        },
                        { field: 'field_1543', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                        { field: 'field_1384', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                        { field: 'field_1415', operator: 'is', value: 'Phonics' },
                      ],
                    },
                  });

                  await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                    date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                    color: feedbackLogRecord.field_1567,
                    __br_phonics: Number(searchLetterSoundPhonic?.records?.length) + Number(searchUFLICurriculum?.records?.length),
                    numeric7__1: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                    numbers1__1: 1,
                    date_1__1: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                  });
                }

                if (!combinedSubjects?.includes('Phonics') && combinedSubjects?.includes('UFLI')) {
                  const searchUFLICurriculum = await knackService.getRecords('object_60', {
                    filters: {
                      match: 'and',
                      rules: [
                        {
                          field: 'field_1414',
                          operator: 'is',
                          value: 'Completed',
                        },
                        { field: 'field_1543', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                        { field: 'field_1384', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                        { field: 'field_1415', operator: 'is', value: feedbackLogRecord.id },
                      ],
                    },
                  });

                  await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                    date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                    color: feedbackLogRecord.field_1567,
                    __br_phonics: Number(searchUFLICurriculum?.records?.length),
                    numeric7__1: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                    numbers1__1: 1,
                  });
                }

                if (combinedSubjects?.includes('Phonics') && !combinedSubjects?.includes('UFLI')) {
                  const searchLetterSoundPhonic = await knackService.getRecords('object_54', {
                    filters: {
                      match: 'and',
                      rules: [
                        {
                          field: 'field_1119',
                          operator: 'is',
                          value: 'Completed',
                        },
                        { field: 'field_1269', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                        { field: 'field_1120', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                        { field: 'field_1166', operator: 'is', value: 'Phonics' },
                        { field: 'field_1367', operator: 'is', value: feedbackLogRecord.id },
                      ],
                    },
                  });

                  await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                    date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                    color: feedbackLogRecord.field_1567,
                    __br_phonics: Number(searchLetterSoundPhonic?.records?.length),
                    numeric7__1: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                    numbers1__1: 1,
                    date_1__1: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                  });
                }
              }
              if (combinedSubjects?.includes('BR-Letters and Sounds')) {
                const searchLetterSoundPhonic = await knackService.getRecords('object_54', {
                  filters: {
                    match: 'and',
                    rules: [
                      {
                        field: 'field_1119',
                        operator: 'is',
                        value: 'Completed',
                      },
                      { field: 'field_1269', operator: 'is', value: feedbackLogRecord.field_1022_raw?.date },
                      { field: 'field_1120', operator: 'is', value: feedbackLogRecord.field_239_raw?.[0]?.id },
                      { field: 'field_1166', operator: 'is', value: 'Letters and Sounds' },
                      { field: 'field_1367', operator: 'is', value: feedbackLogRecord.id },
                    ],
                  },
                });

                await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                  date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                  color: feedbackLogRecord.field_1567,
                  __br_ls: Number(searchLetterSoundPhonic?.records?.length),
                  numeric__1: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
                  numeric8__1: 1,
                });
              }
            }

            //Fluency
            if (feedbackLogRecord.field_1021 == 'Fluency' || feedbackLogRecord.field_1585 == 'Fluency' || feedbackLogRecord.field_1566 == 'Fluency') {
              await BlabMondayService.ChangeMultipleColumnValues(6311984142, resultCreateSubitem, {
                date0: moment(feedbackLogRecord.field_1022_raw?.date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                color: feedbackLogRecord.field_1567,
                numbers6__1: Number(feedbackLogRecord.field_1563) + Number(feedbackLogRecord.field_1564) + Number(feedbackLogRecord.field_1565),
              });
              result = { msg: `Updated Fluency in Binder Analytics Subitem in Monday for feedback log ID ${feedbackLogRecord.id}` };
            }
          }
        }
      }
    }
    // }

    await LogService.DoneLog({ dbData: mondayLog, result });
    return { status, message };
  } catch (error) {
    status = 500;
    message = `Error deleting lesson writing pre-test: ${error.message}`;
    Logger.log(`Error in deleteLessonWritingPreTestDeleted: ${error}`);
    await LogService.ExceptionLog({
      dbData: mondayLog,
      error,
      message: `======Delete Lesson Writing Pre-Test Exception=======`,
    });
    return { status, message: error };
  }
}
