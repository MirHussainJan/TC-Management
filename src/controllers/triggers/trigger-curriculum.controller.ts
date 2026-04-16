import Logger from '../../helper/logger';
import * as readingCurriculumService from '../../services/curriculum/reading-curriculum-to-monday.service';
import * as deleteWritingPreTestService from '../../services/curriculum/delete-lesson-writing-pre-test.service';
import * as sessionFeedbackBinderAnalyticLogToMondayService from '../../services/curriculum/session-feedback-binder-analytic-log-to-monday.service';
export async function readingCurriculumToMonday(req, res) {
  try {
    const { status, message } = await readingCurriculumService.readingCurriculumToMonday(req.body);
    return res.status(status).send({ message });
  } catch (e) {
    Logger.log(`There was an unexpected system error [generateAccountToken]: ${e}`);
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
    const { status, message } = await sessionFeedbackBinderAnalyticLogToMondayService.sessionFeedbackBinderAnalyticLogToMonday(req.body);
    return res.status(status).send({ message });
  } catch (e) {
    Logger.log(`There was an unexpected system error [generateAccountToken]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}
