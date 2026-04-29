import Logger from '../../helper/logger';
import * as deleteWritingPreTestService from '../../services/curriculum/delete-lesson-writing-pre-test.service';
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
    Logger.log(`There was an unexpected system error [sessionFeedbackBinderAnalyticLogToMonday]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}
