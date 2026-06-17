import Logger from '../../helper/logger';
import * as deleteWritingPreTestService from '../../services/curriculum/delete-lesson-writing-pre-test.service';
import * as sessionFeedbackBinderAnalyticLogService from '../../services/curriculum/session-feedback-binder-analytic-log-to-monday.service';
import QueueService from '../../services/queue.service';
import { QueueName } from '../../constants/constant-queue';

export async function readingCurriculumToMonday(req, res) {
  try {
    const jobId = await QueueService.SendDurableQueue(QueueName.ReadingCurriculumToMonday, req.body);
    return res.status(202).send({ message: 'Reading curriculum processing queued', jobId });
  } catch (e) {
    Logger.log(`There was an unexpected system error [readingCurriculumToMonday]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

export async function deleteLessonWritingPreTestDeleted(req, res) {
  try {
    const { status, message } = await deleteWritingPreTestService.deleteLessonWritingPreTestDeleted(req.body);
    return res.status(status).send({ message });
  } catch (e) {
    Logger.log(`There was an unexpected system error [generateAccountToken]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}

export async function sessionFeedbackBinderAnalyticLogToMonday(req, res) {
  try {
    const jobId = await QueueService.SendDurableQueue(QueueName.SessionFeedbackBinderAnalyticLogToMonday, req.body);
    return res.status(202).send({ message: 'Session feedback binder analytic log processing queued', jobId });
  } catch (e) {
    Logger.log(`Queue unavailable [sessionFeedbackBinderAnalyticLogToMonday], falling back to direct background processing: ${e}`);

    setImmediate(async () => {
      try {
        const result = await sessionFeedbackBinderAnalyticLogService.sessionFeedbackBinderAnalyticLogToMonday(req.body);
        if (result?.status >= 500) {
          Logger.log(`Direct background processing failed [sessionFeedbackBinderAnalyticLogToMonday]: ${result?.message}`);
        }
      } catch (backgroundError) {
        Logger.log(`Direct background processing exception [sessionFeedbackBinderAnalyticLogToMonday]: ${backgroundError}`);
      }
    });

    return res.status(202).send({ message: 'Session feedback binder analytic log processing started without queue' });
  }
}
