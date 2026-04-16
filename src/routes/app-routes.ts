import { Router } from 'express';
import * as triggerWS from '../controllers/triggers/trigger-weekly-scheduling';
import * as triggerTAM from '../controllers/triggers/trigger-tutor-available-master';
import * as triggerSHL from '../controllers/triggers/trigger-student-hours-log';
import * as test from '../controllers/actions/test';
import * as forwardWebhook from '../controllers/actions/forward-webhook';
import * as triggerSD from '../controllers/triggers/trigger-student-database';
import * as triggerGenerateAccountToken from '../controllers/triggers/trigger-generate-account-token';
import appValidationMiddleware from '../middlewares/validation-account-token';
import cors from 'cors';
import { runSDNextSession } from '../controllers/actions/test';
import * as temp from '../controllers/actions/temp';
import * as moveToSHL from '../controllers/actions/move-shl-to-family-shl';
import * as progressChart from '../controllers/actions/act-progress-chart';
import * as mws from '../controllers/actions/act-mws';
import * as ed from '../controllers/actions/act-employee-directory';
import * as tcc from '../controllers/actions/act-tcc';
import * as triggerCurriculum from '../controllers/triggers/trigger-curriculum.controller';

const router = Router();

router.post(`/new-ws-update-tutor-off`, triggerWS.UpdateTutorOff);
router.post(`/tam-refresh-tutor-count`, triggerTAM.RefreshTutorCount);
router.post(`/shl-deduct-hours`, triggerSHL.DeductHours);
router.post(`/shl-audited-remaining-hour`, triggerSHL.AuditedRemainingHour);
router.post(`/sd-next-session`, triggerSD.NextSession);
router.post(`/forward-webhook`, forwardWebhook.forwardWebhook);
router.post(`/generate-account-token`, triggerGenerateAccountToken.generateAccountToken);
router.get(
  `/validate-account-token/:accountId/:token`,
  cors({
    origin: ['https://dashboard.tcstjohns.com', 'http://localhost:4200'],
    methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH', 'OPTIONS'],
    optionsSuccessStatus: 200,
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
  appValidationMiddleware,
  triggerGenerateAccountToken.validateAccountToken,
);
router.post(`/test-board-app-log`, test.boardAppLog);

router.post(`/test-update`, test.updateMultiple);
router.get(`/test-pre-run-sd-next-session`, test.preRunSDNextSession);
router.post(`/test-run-sd-next-session`, test.runSDNextSession);
// router.post(`/adjustment-add`, temp.adjustmentSHL);
router.post(`/move-shl-to-family-shl`, moveToSHL.move);
router.post(`/progress-chart`, progressChart.progressChart);
router.post(`/mws-ms-to-ws-sync`, mws.MWS34MSToWSSync);
router.post(`/shl-add-from-ws`, triggerSHL.AddFromWS);
router.post(`/es-19-generate-schedule`, ed.ES19StaffScheduleGenerateSchedule);
router.post(`/es-18-export-google-sheet`, ed.ES18StaffScheduleExportGS);
router.post(`/tcc10-sms-clicksend-send`, tcc.tcc10SMSClicksendSend);
router.post(`/shl-add-to-family-shl`, triggerSHL.AddFamilySHL);
router.post(`/reading-curriculum-to-monday`, triggerCurriculum.readingCurriculumToMonday);
router.post(`/delete-lesson-writing-pre-test-deleted`, triggerCurriculum.deleteLessonWritingPreTestDeleted);
router.post(`/session-feedback-binder-analytic-log-to-monday`, triggerCurriculum.sessionFeedbackBinderAnalyticLogToMonday);

export default router;
