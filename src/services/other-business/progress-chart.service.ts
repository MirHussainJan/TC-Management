import { BoardConstants, Constants, EventName, ReadingSubitemNameConst, StudentBinderConst, WorkspacesConst } from '../../constants/constant';
import ConstColumn from '../../constants/constant-column';
import BlabMondayService from '../blab-monday.service';
import * as gDriveService from './g-drive.service';
import * as gSheetService from './g-sheet.service';
import moment from 'moment';
import * as _ from 'lodash';
import CommonService from '../common-service';
import LogService from '../log-service';
import Logger from '../../helper/logger';

export default class ProgressChartService {
  static sheetToUpdate = '';
  static async run(payload) {
    const { pulseId } = payload;
    Logger.log(`[ProgressChart] Starting progress chart generation for pulseId: ${pulseId}`);
    let dbData;
    let isRetry = true;
    let retry = 0;
    while (isRetry) {
      try {
        const studentDatabaseItem = await BlabMondayService.GetItemById(pulseId, [
          ConstColumn.SD.StudentID,
          ConstColumn.SD.AccountID,
          ConstColumn.SD.Grade,
          ConstColumn.SD.SessionPerWeek,
          ConstColumn.SD.NumberOfSession,
          ConstColumn.SD.HoursRemaining,
          ConstColumn.SD.VocabLevel,
          ConstColumn.SD.ComprehensionLevel,
          ConstColumn.SD.ReadingStop,
          ConstColumn.SD.MathStop,
          ConstColumn.SD.WritingStop,
          ConstColumn.SD.WritingLevel,
        ]);
        let logData = {
          board_id: 3288941979,
          item_id: pulseId,
          item_name: studentDatabaseItem.name,
          board_name: CommonService.getBoardName(3288941979),
          event_name: EventName.PR,
          event_data: payload,
          monday_item_id: 0,
        };
        // const { mondayLog } = await LogService.StartLog(logData);
        // dbData = mondayLog;
        if (dbData) dbData.event_status = true;
        const studentId = this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.StudentID);
        const accountId = this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.AccountID);
        Logger.log(`[ProgressChart] Processing student - ID: ${studentId}, Account: ${accountId}, Name: ${studentDatabaseItem.name}`);

        if (studentId) {
          const spredSheetId = await this.searchFileChartProgress(studentDatabaseItem);
          Logger.log(`[ProgressChart] Found spreadsheet ID: ${spredSheetId}`);

          if (!spredSheetId) {
            Logger.log(`[ProgressChart] No spreadsheet found for student ${studentId}, updating status to Done`);
            this.updateProgressReportStatus(pulseId, Constants.Done);
            return;
          }

          const subitemLeadPipeline = await BlabMondayService.GetItemsPageByColumnValues(
            BoardConstants.SubLeadPipeline,
            [{ column_id: ConstColumn.SubLeadPipeline.StudentId, column_values: studentId }],
            [ConstColumn.SubLeadPipeline.AssessmentDate],
          );
          Logger.log(`[ProgressChart] Found ${subitemLeadPipeline?.length || 0} lead pipeline items`);

          const sessionFeedbackLog = await BlabMondayService.GetItemsPageByColumnValues(
            BoardConstants.SessionFeedbackLog,
            [{ column_id: ConstColumn.SessionFeedbackLog.StudentName, column_values: studentDatabaseItem.name }],
            [
              ConstColumn.SessionFeedbackLog.Effort,
              ConstColumn.SessionFeedbackLog.Behavior,
              ConstColumn.SessionFeedbackLog.Understanding,
              ConstColumn.SessionFeedbackLog.Type,
              ConstColumn.SessionFeedbackLog.Subject,
              ConstColumn.SessionFeedbackLog.Date,
            ],
          );
          Logger.log(`[ProgressChart] Found ${sessionFeedbackLog?.length || 0} session feedback logs`);

          const data: any = [];
          //Row 6 B-X, 7 B-X, 8 B-X
          const assessmentDate = subitemLeadPipeline?.[0]?.column_values?.[0]?.text || null;
          const studentName = studentDatabaseItem.name;
          const { grade, sessionperWeek, sessionsCompleted, hoursRemaining } = this.getTextStudentDatabase(studentDatabaseItem.column_values);
          const today = moment().format('MM/DD/YYYY');
          const { effort, behavior, understanding } = this.avgSessionFeedbackLog(sessionFeedbackLog);
          data.push({
            range: `${this.sheetToUpdate}!B6:X8`,
            majorDimension: 'ROWS',
            values: [
              [
                studentName,
                null,
                null,
                null,
                null,
                null,
                grade ?? ' ',
                null,
                null,
                null,
                null,
                null,
                // assessmentDate?.length ? moment(assessmentDate).format('MM/DD/YYYY') : null,
                assessmentDate,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                today ?? null,
              ],
              [sessionsCompleted ?? ' ', null, null, null, null, null, null, null, hoursRemaining ?? ' ', null, null, null, null, null, sessionperWeek ?? ' '],
              [
                effort ?? ' ',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                understanding ?? ' ',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                behavior ?? ' ',
              ],
            ],
          });

          const allBinderBoard = await BlabMondayService.getWorkspaceBoards(WorkspacesConst.Binder);
          // const studentBinderBoardId = _.filter(allBinderBoard, (s) => s.name === `${studentName} | ${studentId}`)?.[0]?.id;
          const studentBinderBoardId = _.filter(allBinderBoard, (s) => s.name.includes(studentId) && !s.name?.toLowerCase().startsWith('subitems of'))?.[0]?.id;
          Logger.log(`[ProgressChart] Found student binder board ID: ${studentBinderBoardId}`);

          const studentBinderBoardAllGroups = await BlabMondayService.GetBoardListGroup(studentBinderBoardId);
          // Optimize: use Set for faster lookup and reduce for single-pass
          const groupSet = new Set(['Beginning Reader', 'Reading', 'Math Facts', 'Math', 'Writing']);
          const studentBinderBoardGroups = (studentBinderBoardAllGroups?.data?.boards?.[0]?.groups || []).reduce((acc, s) => {
            if (groupSet.has(s.title)) acc.push(s.id);
            return acc;
          }, []);
          const studentBinderBoard = await BlabMondayService.GetGroupListItem(studentBinderBoardId, studentBinderBoardGroups);
          Logger.log(`[ProgressChart] Retrieved student binder board with ${studentBinderBoard?.length || 0} items`);

          const binderAnalyticsData = await BlabMondayService.GetItemsPageByColumnValues(
            BoardConstants.BinderAnalyticsData,
            [{ column_id: ConstColumn.BinderAnalyticsData.StudentId, column_values: studentId }],
            // [ConstColumn.SessionFeedbackLog.Effort, ConstColumn.SessionFeedbackLog.Behavior, ConstColumn.SessionFeedbackLog.Understanding],
            [],
            null,
            [],
            true,
          );
          Logger.log(`[ProgressChart] Found ${binderAnalyticsData?.length || 0} binder analytics data items`);

          const tutorUpSubitems = _.filter(_.get(binderAnalyticsData?.[0], 'subitems'), (subitem) => {
            const subjectsColumn = _.find(subitem.column_values, (cv) => cv.id === 'subjects');
            return subjectsColumn && subjectsColumn.text?.toLowerCase().includes('tutor up');
          });
          Logger.log(`[ProgressChart] Found ${tutorUpSubitems?.length || 0} tutor up subitems`);
          // Process tutorUpSubitems by month

          const binderData = this.getBinderData(binderAnalyticsData?.[0]?.column_values);
          const subitemBinderAnalyticsData = _.filter(_.get(binderAnalyticsData?.[0], 'subitems'), (s) => {
            return _.some(s.column_values, (cv) => cv.id === ConstColumn.SubBinderAnalyticsData.ActiveSubjects && cv.text?.length > 0);
          })?.[0];
          const activeSubjects = this.getColumnValuesById(subitemBinderAnalyticsData, ConstColumn.SubBinderAnalyticsData.ActiveSubjects);

          const studentBinderData = this.getStudentBinderData(studentBinderBoard);
          Logger.log(
            `[ProgressChart] Processed student binder data - Beginning Reader: ${studentBinderData?.sbdBeginningReader?.length || 0}, Reading: ${
              studentBinderData?.sbdReading?.length || 0
            }, Math: ${studentBinderData?.sbdMath?.length || 0}, Writing: ${studentBinderData?.sbdWriting?.length || 0}, Math Facts: ${
              studentBinderData?.sbdMathFacts?.length || 0
            }`,
          );

          const brBinderAnalyticsData = _.filter(_.get(binderAnalyticsData?.[0], 'subitems'), (subitem) => {
            const subjectsColumn = _.find(subitem.column_values, (cv) => cv.id === ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn);
            return subjectsColumn && (subjectsColumn.text?.includes('BR-Letters and Sounds') || subjectsColumn.text?.includes('BR-Phonics'));
          });
          Logger.log(`[ProgressChart] Found ${brBinderAnalyticsData?.length || 0} beginning reader subitems from binder analytics`);

          // Tính brLesson từ brBinderAnalyticsData
          const brLesson = _.sumBy(brBinderAnalyticsData || [], (subitem) => {
            const brLsValue = _.find(subitem.column_values, { id: '__br_ls' })?.text;
            const brPhonicsValue = _.find(subitem.column_values, { id: '__br_phonics' })?.text;
            return (Number(brLsValue) || 0) + (Number(brPhonicsValue) || 0);
          });

          // Tính brSession từ brBinderAnalyticsData
          const hasLettersAndSounds = _.some(brBinderAnalyticsData, (subitem) => {
            const subjectsColumn = _.find(subitem.column_values, { id: ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn });
            return subjectsColumn?.text?.includes('BR-Letters and Sounds');
          });
          const hasPhonics = _.some(brBinderAnalyticsData, (subitem) => {
            const subjectsColumn = _.find(subitem.column_values, { id: ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn });
            return subjectsColumn?.text?.includes('BR-Phonics');
          });

          let brSession = 0;
          if (hasLettersAndSounds && hasPhonics) {
            // Có cả hai loại: sum của numeric8__1 và numbers1__1
            const numeric8Values = brBinderAnalyticsData
              .filter((subitem) => {
                const subjectsColumn = _.find(subitem.column_values, { id: ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn });
                return subjectsColumn?.text?.includes('BR-Letters and Sounds');
              })
              .map((subitem) => Number(_.find(subitem.column_values, { id: 'numeric8__1' })?.text) || 0);
            const numbers1Values = brBinderAnalyticsData
              .filter((subitem) => {
                const subjectsColumn = _.find(subitem.column_values, { id: ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn });
                return subjectsColumn?.text?.includes('BR-Phonics');
              })
              .map((subitem) => Number(_.find(subitem.column_values, { id: 'numbers1__1' })?.text) || 0);
            brSession = _.sum(numeric8Values) + _.sum(numbers1Values);
          } else if (hasLettersAndSounds) {
            // Chỉ có BR-Letters and Sounds: lấy max của numeric8__1
            const numeric8Values = brBinderAnalyticsData
              .filter((subitem) => {
                const subjectsColumn = _.find(subitem.column_values, { id: ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn });
                return subjectsColumn?.text?.includes('BR-Letters and Sounds');
              })
              .map((subitem) => Number(_.find(subitem.column_values, { id: 'numeric8__1' })?.text) || 0);
            brSession = _.max(numeric8Values) || 0;
          } else if (hasPhonics) {
            // Chỉ có BR-Phonics: lấy max của numbers1__1
            const numbers1Values = brBinderAnalyticsData
              .filter((subitem) => {
                const subjectsColumn = _.find(subitem.column_values, { id: ConstColumn.SubBinderAnalyticsData.SubjtectsWorkedOn });
                return subjectsColumn?.text?.includes('BR-Phonics');
              })
              .map((subitem) => Number(_.find(subitem.column_values, { id: 'numbers1__1' })?.text) || 0);
            brSession = _.max(numbers1Values) || 0;
          }

          Logger.log(`[ProgressChart] Calculated BR data from binder analytics - Lessons: ${brLesson}, Sessions: ${brSession}`);

          const _beginningReaderActive = _.filter(studentBinderData?.sbdBeginningReader, (s) => {
            return _.some(
              s.column_values,
              (cv) =>
                cv.id === ConstColumn.StudentBinder.SubjectStatus &&
                (cv.text === Constants.Active || cv.text === Constants.CourseCompleted || cv.text === Constants.Completed),
            );
          });

          const beginningReaderActive =
            _beginningReaderActive?.length == 1
              ? _beginningReaderActive[0]
              : _.maxBy(_beginningReaderActive, (student) => {
                  const dateCv = _.find(student.column_values, { id: 'date4' });
                  const parsed = new Date(dateCv?.text);
                  return parsed ? parsed.getTime() : -Infinity;
                });
          // 1. Tìm subitem có status = 'Active'
          const activeSubitem = _.find(beginningReaderActive?.subitems, (sub) => {
            return _.some(sub.column_values, (cv) => cv.id === 'status' && cv.text === 'Active');
          });

          // 2. Lấy text từ column id = 'text3'
          const text3 = _.find(activeSubitem?.column_values, { id: 'text3' })?.text || '';

          // 3. Tách phần số từ text
          const lessonNumber = text3.match(/\d+/)?.[0] || null;
          // Tính tổng numbers1__1 từ tất cả subitems của tất cả items trong _beginningReaderActive
          // const totalNumbers = _.sumBy(_beginningReaderActive || [], (item) => {
          //   return _.sumBy(item.subitems || [], (sub) => {
          //     const value = _.find(sub.column_values, { id: 'numbers1__1' })?.text;
          //     return Number(value) || 0;
          //   });
          // });

          const completedCourses = _.filter(studentBinderData?.sbdBeginningReader, (s) => {
            return (
              _.some(s.column_values, (cv) => cv.id === ConstColumn.StudentBinder.SubjectStatus && cv.text === Constants.CourseCompleted) &&
              _.some(s.column_values, (cv) => cv.id === ConstColumn.StudentBinder.CompletedDate && cv.text?.length)
            );
          });

          const sortedCourses = _.orderBy(
            completedCourses,
            (s) => {
              const dateStr = this.getColumnValuesById(s, ConstColumn.StudentBinder.CompletedDate);
              return new Date(dateStr);
            },
            ['desc'],
          );

          // Lấy course gần nhất
          const beginningReaderCourseComplete = sortedCourses?.[0];

          const beginningReaderDate = this.getColumnValuesById(beginningReaderCourseComplete, ConstColumn.StudentBinder.CompletedDate);

          // const sharpLessons =
          //   beginningReaderActive?.name === 'Phonics'
          //     ? binderData.sharpBRPhonicsLessons
          //     : beginningReaderActive?.name === 'Letters and Sounds'
          //     ? binderData.sharpBRLSLessons
          //     : _.parseInt(binderData.sharpBRLSLessons ?? 0) + _.parseInt(binderData.sharpBRPhonicsLessons ?? 0);
          // const sharpLessons = totalNumbers;
          // const sharpSessons =
          //   beginningReaderActive?.name === 'Phonics'
          //     ? binderData.sharpBRPhonicsSessions
          //     : beginningReaderActive?.name === 'Letters and Sounds'
          //       ? binderData.sharpBRLSSessions
          //       : _.parseInt(binderData.sharpBRLSSessions ?? 0) + _.parseInt(binderData.sharpBRPhonicsSessions ?? 0);

          //Tutor Up 21
          Logger.log(`[ProgressChart] Processing Tutor Up data - Sessions: ${binderData.tuSession}`);
          data.push({
            range: `${this.sheetToUpdate}!I21`,
            majorDimension: 'ROWS',
            values: [[Number(binderData.tuSession) ?? ' ']],
          });
          //Beginner Reader 22 - 23
          Logger.log(
            `[ProgressChart] Processing Beginning Reader - Active course: ${beginningReaderActive?.name}, Lesson: ${lessonNumber}`,
          );
          data.push({
            range: `${this.sheetToUpdate}!H22`,
            majorDimension: 'ROWS',
            values: [[beginningReaderActive?.name ?? ' ']],
          });
          data.push({
            range: `${this.sheetToUpdate}!P22`,
            majorDimension: 'ROWS',
            values: [[lessonNumber]],
          });

          data.push({
            range: `${this.sheetToUpdate}!E23:W23`,
            majorDimension: 'ROWS',
            values: [
              [
                brLesson ?? ' ',
                null,
                null,
                null,
                brSession ?? ' ',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                // beginningReaderDate?.length ? moment(beginningReaderDate).format('MM/DD/YYYY') : null,
                beginningReaderDate,
              ],
            ],
          });
          //End Beginner Reader 22 - 23

          //Reading 24 - 56
          const readingActive = _.filter(studentBinderData?.sbdReading, (s) => {
            return _.some(
              s.column_values,
              (cv) =>
                cv.id === ConstColumn.StudentBinder.SubjectStatus &&
                (cv.text === Constants.Active || cv.text === Constants.CourseCompleted || cv.text === Constants.Completed),
            );
          });
          Logger.log(`[ProgressChart] Processing Reading data - Active courses: ${readingActive?.length || 0}`);
          const readingCompleted = _.filter(readingActive, (s) => {
            return (
              _.some(s.column_values, (cv) => cv.id === ConstColumn.StudentBinder.SubjectStatus && cv.text === Constants.CourseCompleted) &&
              _.some(s.column_values, (cv) => cv.id === ConstColumn.StudentBinder.CompletedDate && cv.text?.length)
            );
          });
          const sortedReadingCompleted = _.orderBy(
            readingCompleted,
            (s) => {
              const dateStr = this.getColumnValuesById(s, ConstColumn.StudentBinder.CompletedDate);
              return new Date(dateStr);
            },
            ['desc'],
          );
          const sortedBeginningReaderCoursesFromReading = sortedReadingCompleted?.[0];
          const beginningReaderCourseFromReadingDate = this.getColumnValuesById(
            sortedBeginningReaderCoursesFromReading,
            ConstColumn.StudentBinder.CompletedDate,
          );
          if (beginningReaderCourseFromReadingDate) {
            data.push({
              range: `${this.sheetToUpdate}!W23`,
              majorDimension: 'ROWS',
              values: [[beginningReaderCourseFromReadingDate]],
            });
          }

          const readingActive1 = _.map(readingActive, (item) => ({
            ...item,
            column_values: _.find(item.column_values, { id: ConstColumn.StudentBinder.SubjectLevel }),
          }))?.filter((item) => item.column_values);

          const maxLevelReadingActive = _.maxBy(readingActive1, (item) => Number(item.column_values.text))?.column_values.text;
          Logger.log(`[ProgressChart] Reading max level: ${maxLevelReadingActive}`);
          // const maxLevelReadingActive =
          //   !readingActive || readingActive.length === 0
          //     ? null
          //     : _.maxBy(readingActive, (s) => {
          //         const numbersCV = _.find(s.column_values, (cv) => cv.id === 'numbers');
          //         return numbersCV ? numbersCV.text : -Infinity;
          //       });
          const sbdReadingSubitem = studentBinderData?.sbdReading?.flatMap((s) => s.subitems);
          const vocabAverage = this.calculateAverages(sbdReadingSubitem, 'Vocabulary Skills');

          data.push({
            range: `${this.sheetToUpdate}!V24:X24`,
            majorDimension: 'ROWS',
            values: [[this.minutesToHours(binderData?.timeOnReading) ?? ' ', null, readingActive?.length ? Constants.Active : ' ']],
          });
          const readingStop = this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.ReadingStop);
          data.push({
            range: `${this.sheetToUpdate}!C25:F25`,
            majorDimension: 'ROWS',
            values: [[this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.VocabLevel) ?? ' ', null, maxLevelReadingActive ?? ' ']],
          });
          data.push({
            range: `${this.sheetToUpdate}!Y25`,
            majorDimension: 'ROWS',
            values: [[vocabAverage ?? ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!C41:F41`,
            majorDimension: 'ROWS',
            values: [[this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.ComprehensionLevel) ?? ' ', null, maxLevelReadingActive ?? ' ']],
          });

          const compreAverage = this.calculateAverages(sbdReadingSubitem, 'Comprehension Skills');

          data.push({
            range: `${this.sheetToUpdate}!Y41`,
            majorDimension: 'ROWS',
            values: [[compreAverage ?? ' ']],
          });
          for (let i = 0; i < studentBinderData?.sbdReading?.length; i++) {
            const itemReading = studentBinderData?.sbdReading[i];
            const level = this.getColumnValuesById(itemReading, ConstColumn.StudentBinder.SubjectLevel);
            for (let subitemIndex = 0; subitemIndex < itemReading.subitems?.length; subitemIndex++) {
              const subitemReading = itemReading.subitems[subitemIndex];
              if (ReadingSubitemNameConst.includes(subitemReading?.name)) {
                const { n1, n2 } = this.getRowNumberReading(subitemReading.name);
                const { c1, c2, c3 } = this.getColumnReading(level);
                let range = '';
                if (c1 && n1 && c2 && n2) {
                  range = `${c1}${n1}:${c2}${n2}`;
                  const completedDate = this.getColumnValuesById(subitemReading, ConstColumn.SubStudentBinder.CompletedDate);
                  const numberOfSessionReading = this.getColumnValuesById(subitemReading, ConstColumn.SubStudentBinder.NumberOfSessions);
                  const numberOfLessionReading = this.getColumnValuesById(subitemReading, ConstColumn.SubStudentBinder.NumberOfLession);

                  data.push({
                    range: `${this.sheetToUpdate}!${range}`,
                    majorDimension: 'ROWS',
                    values: [
                      [Number(numberOfLessionReading) || ' ', Number(numberOfSessionReading) || ' '],
                      // [completedDate?.length ? new Date(completedDate).toLocaleDateString() : null],
                      [completedDate?.length ? completedDate : null],
                    ],
                  });
                }
              }
            }
          }
          //End Reading 24 - 56

          ///Math Facts 69 - 71
          const mathFactDetails: any = this.getMathFactDetails(studentBinderData.sbdMathFacts);
          Logger.log(
            `[ProgressChart] Processing Math Facts - Addition: ${mathFactDetails?.addition}, Subtraction: ${mathFactDetails?.subtraction}, Multiplication: ${mathFactDetails?.multiplication}`,
          );
          // const additionSum = mathFactDetails?.addition?.column_values?.filter(
          //   (s) => s.id === ConstColumn.StudentBinder.Status && s.text === Constants.Completed,
          // )?.length;
          // const subtractionSum = mathFactDetails?.subtraction?.column_values?.filter(
          //   (s) => s.id === ConstColumn.StudentBinder.Status && s.text === Constants.Completed,
          // )?.length;
          // const multiplicationSum = mathFactDetails?.multiplication?.column_values?.filter(
          //   (s) => s.id === ConstColumn.StudentBinder.Status && s.text === Constants.Completed,
          // )?.length;
          // const dateAddition = this.getColumnValuesById(mathFactDetails.addition, ConstColumn.StudentBinder.Status);
          // const dateSubtraction = this.getColumnValuesById(mathFactDetails.subtraction, ConstColumn.StudentBinder.Status);
          // const dateMultiplication = this.getColumnValuesById(mathFactDetails.multiplication, ConstColumn.StudentBinder.Status);
          data.push({
            range: `${this.sheetToUpdate}!AA69:AA71`,
            majorDimension: 'ROWS',
            values: [
              [Number(mathFactDetails?.addition) || ' '],
              [Number(mathFactDetails?.subtraction) || ' '],
              [Number(mathFactDetails?.multiplication) || ' '],
            ],
          });
          //End Math Facts 68 - 71

          ///Math 71 - 117
          const mathDetail = '';
          const mathActive = _.filter(studentBinderData.sbdMath, (s) => {
            return _.some(
              s.column_values,
              (cv) =>
                cv.id === ConstColumn.StudentBinder.SubjectStatus &&
                (cv.text === Constants.Active || cv.text === Constants.CourseCompleted || cv.text === Constants.Completed),
            );
          });
          Logger.log(`[ProgressChart] Processing Math data - Active courses: ${mathActive?.length || 0}`);

          const mathLowestActive1 = _.map(mathActive, (item) => ({
            ...item,
            column_values: _.find(item.column_values, { id: ConstColumn.StudentBinder.SubjectLevel }),
          }))?.filter((item) => item.column_values && item.column_values.text && item.column_values.text.trim() !== '');
          const mathLowestActive = _.minBy(mathLowestActive1, (item) => item.column_values.text)?.column_values.text;
          const mathMaxActive = _.maxBy(mathLowestActive1, (item) => item.column_values.text)?.column_values.text;
          Logger.log(`[ProgressChart] Math levels - Min: ${mathLowestActive}, Max: ${mathMaxActive}`);

          data.push({
            range: `${this.sheetToUpdate}!C71:T71`,
            majorDimension: 'ROWS',
            values: [
              [
                mathLowestActive ?? ' ',
                null,
                mathMaxActive ?? ' ',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                this.minutesToHours(binderData.timeOnMath) ?? ' ',
                null,
                mathActive?.length ? Constants.Active : ' ',
              ],
            ],
          });
          for (let i = 0; i < studentBinderData?.sbdMath?.length; i++) {
            const element = studentBinderData?.sbdMath[i];
            let level = _.parseInt(this.getColumnValuesById(element, ConstColumn.StudentBinder.SubjectLevel));
            if (element.name === 'Numerations 1/2') {
              level = 2;
            }
            const { cm1, cm2 } = this.getColumnMath(level);
            const { rm1, rm2 } = this.getRowMath(element.name);
            // const lessonMath = this.getColumnValuesById(element, ConstColumn.StudentBinder.SharpOfLessonSummary);
            const lessonMath =
              _.sum(
                element.subitems
                  .flatMap((s: any) => s.column_values)
                  .filter((s: any) => s.id === ConstColumn.SubStudentBinder.NumberOfLession)
                  .map((s: any) => _.parseInt(s.text || '0') || 0),
              ) ?? null;
            const date = this.getColumnValuesById(element, ConstColumn.StudentBinder.CompletedDate);
            const numberOfSession =
              _.sum(
                element.subitems
                  .flatMap((s: any) => s.column_values)
                  .filter((s: any) => s.id === ConstColumn.SubStudentBinder.NumberOfSessions)
                  .map((s: any) => _.parseInt(s.text || '0') || 0),
              ) ?? null;

            const preTest = this.getColumnValuesById(element, ConstColumn.StudentBinder.PreTest, 2);
            const splitPreTest = preTest?.split(', ');
            const sumPreTest = splitPreTest?.length ? _.sum(splitPreTest.map((val) => Number(val.trim()))) / splitPreTest?.length : 0;

            const postTest = this.getColumnValuesById(element, ConstColumn.StudentBinder.PostTestSub, 2);
            const splitPostTest = postTest?.split(', ');
            const sumPostTest = splitPostTest?.length ? _.sum(splitPostTest.map((val) => Number(val.trim()))) / splitPostTest?.length : 0;
            // const calPreTest = !isNaN(Number(sumPreTest)) && Number(sumPreTest) > 0 ? Number(sumPreTest) / 100 : 0;
            const calPreTest = !isNaN(Number(sumPreTest)) && Number(sumPreTest) > 0 ? Number(sumPreTest) / 100 : 0;
            // const calPostTest = !isNaN(Number(sumPostTest)) && Number(sumPostTest) > 0 ? Number(sumPostTest) / 100 : 0;
            const calPostTest = !isNaN(Number(sumPostTest)) && Number(sumPostTest) > 0 ? Number(sumPostTest) / 100 : 0;
            if (cm1 && cm2 && rm1 && rm2) {
              data.push({
                range: `${this.sheetToUpdate}!${cm1}${rm1}:${cm2}${rm2}`,
                majorDimension: 'ROWS',
                values: [
                  [null, null, Number(lessonMath) || 0, Number(numberOfSession) || 0],
                  // [calPreTest, calPostTest, date?.length ? moment(date).format('MM/DD/YYYY') ?? null : null],
                  [calPreTest, calPostTest, date?.length ? (date ?? null) : null],
                ],
              });
            }
            if (element.name === 'Addition / Subtraction 3' || element.name === 'Addition & Subtraction 3') {
              data.push({
                range: `${this.sheetToUpdate}!I77:L78`,
                majorDimension: 'ROWS',
                values: [
                  [null, null, Number(lessonMath) || ' ', Number(numberOfSession) || ' '],
                  // [calPreTest, calPostTest, date?.length ? moment(date)?.format('MM/DD/YYYY') ?? null : null],
                  [calPreTest, calPostTest, date?.length ? (date ?? null) : null],
                ],
              });
            }
            if (element.name === 'Multiplication / Division 4' || element.name === 'Multiplication & Division 4') {
              data.push({
                range: `${this.sheetToUpdate}!M85:P86`,
                majorDimension: 'ROWS',
                values: [
                  [null, null, Number(lessonMath) || ' ', Number(numberOfSession) || ' '],
                  [calPreTest, calPostTest, date?.length ? (date ?? null) : null],
                  // [calPreTest, calPostTest, date?.length ? moment(date)?.format('MM/DD/YYYY') ?? null : null],
                ],
              });
            }
          }
          // const math = _.filter(studentBinderData.sbdMath, (s) => {
          //   return _.some(s.column_values, (cv) => cv.id === ConstColumn.StudentBinder.SubjectStatus && cv.text === Constants.Active);
          // });
          const mathElements = studentBinderData?.sbdMath || [];

          // Prefixes to group by (same strings you were passing to calculateAverages)
          const mathPrefixes = [
            'Addition',
            'Subtraction',
            'Multiplication',
            'Division',
            'Fractions',
            'Decimals',
            'Ratios',
            'Numerations',
            'Word Problems',
            'Measures & Geometric',
            'Equations',
            'Integers',
            'Intro- Algebra',
          ];

          // Initialize buckets
          const mathSubitemsByPrefix: Record<string, any[]> = {};
          for (const p of mathPrefixes) mathSubitemsByPrefix[p] = [];

          // One-pass grouping: for each parent math element, if its name startsWith a prefix -> push its subitems to that bucket
          for (const el of mathElements) {
            if (!el?.name) continue;
            const elName = el.name.trim().toLowerCase();
            for (const p of mathPrefixes) {
              if (elName.startsWith(p.toLowerCase())) {
                // add all subitems of this math element to the corresponding prefix bucket
                mathSubitemsByPrefix[p].push(...(el.subitems || []));
                // assume one parent belongs to a single prefix -> break to avoid duplicate buckets
                break;
              }
            }
          }

          // Debug log: counts per prefix (optional, useful for smoke-test)
          Logger.log(`[ProgressChart] math subitems by prefix counts: ${mathPrefixes.map((p) => `${p}:${(mathSubitemsByPrefix[p] || []).length}`).join(', ')}`);

          // Use the prefiltered buckets when calling calculateAverages.
          // Pass null (or no prefix) as second arg so calculateAverages will NOT re-filter by subitem.name.
          data.push({
            range: `${this.sheetToUpdate}!AB72`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Addition'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB76`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Subtraction'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB80`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Multiplication'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB84`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Division'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB88`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Fractions'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB92`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Decimals'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB96`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Ratios'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB100`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Numerations'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB104`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Word Problems'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB108`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Measures & Geometric'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB112`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Equations'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB115`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Integers'] || [], null)) || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!AB120`,
            majorDimension: 'ROWS',
            values: [[Number(this.calculateAverages(mathSubitemsByPrefix['Intro- Algebra'] || [], null)) || ' ']],
          });

          //End Math 71 - 117
          //Writing 124 - 130
          const writingActive = _.filter(studentBinderData.sbdWriting, (s) => {
            return _.some(
              s.column_values,
              (cv) =>
                cv.id === ConstColumn.StudentBinder.SubjectStatus &&
                (cv.text === Constants.Active || cv.text === Constants.CourseCompleted || cv.text === Constants.Completed),
            );
          });
          Logger.log(`[ProgressChart] Processing Writing data - Active courses: ${writingActive?.length || 0}`);

          const writingActive1 = _.map(writingActive, (item) => ({
            ...item,
            column_values: _.find(item.column_values, { id: ConstColumn.StudentBinder.SubjectLevel }),
          }))?.filter((item) => item.column_values);

          const maxWritingActive = _.maxBy(writingActive1, (item) => item.column_values.text);
          const maxWritingActiveFull = maxWritingActive?.name?.length
            ? `${maxWritingActive?.name.replace('Writing | ', '')} (${maxWritingActive?.column_values.text})`
            : null;
          Logger.log(`[ProgressChart] Writing max level: ${maxWritingActiveFull}`);
          data.push({
            // range: `${this.sheetToUpdate}!Q124:S124`,
            range: `${this.sheetToUpdate}!S124:U124`,
            majorDimension: 'ROWS',
            values: [[this.minutesToHours(binderData.timeOnWriting) ?? ' ', null, writingActive?.length ? Constants.Active : ' ']],
          });
          // const percentWriting = this.getColumnValuesById(writingActive?.[0], ConstColumn.StudentBinder.PercentCompleted, 2);
          // const percentWritingtotal = _.sum(percentWriting?.split(', ')) / percentWriting?.split(', ')?.length;
          // Bước 1: Lọc các phần tử có id là 'lookup'
          const percentWritingtotallookupValues = studentBinderData.sbdWriting
            .map((item) => {
              const lookupColumn = item.column_values.find((col) => col.id === ConstColumn.StudentBinder.PercentCompleted);
              return lookupColumn ? lookupColumn.display_value : null;
            })
            .filter((value) => value !== null);

          // Bước 2: Tính trung bình cho mỗi chuỗi display_value
          const percentWritingtotalaverages = percentWritingtotallookupValues.map((value) => {
            const numbers = value.split(',').map((num) => parseFloat(num.trim() || 0));
            const sum = numbers.reduce((acc, num) => acc + num, 0);
            return sum / numbers.length;
          });

          // Bước 3: Tính tổng trung bình của tất cả các giá trị đã tính
          const percentWritingtotal = percentWritingtotalaverages.reduce((acc, avg) => acc + avg, 0) / percentWritingtotalaverages.length;
          data.push({
            range: `${this.sheetToUpdate}!W125`,
            majorDimension: 'ROWS',
            values: [[Number(percentWritingtotal) / 100 || ' ']],
          });

          data.push({
            range: `${this.sheetToUpdate}!C125:F125`,
            majorDimension: 'ROWS',
            values: [[this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.WritingLevel) ?? ' ', null, maxWritingActiveFull ?? ' ']],
          });

          if (!studentBinderData?.sbdWriting?.length) {
            data.push({
              range: `${this.sheetToUpdate}!E129`,
              majorDimension: 'ROWS',
              values: [[0]],
            });
          }
          for (let i = 0; i < studentBinderData?.sbdWriting?.length; i++) {
            const element = studentBinderData?.sbdWriting[i];
            const lessonWriting = this.getColumnValuesById(element, ConstColumn.StudentBinder.SharpOfLessonsWritingWordAttack);
            const date = this.getColumnValuesById(element, ConstColumn.StudentBinder.CompletedDate);
            const numberOfSession =
              _.sum(
                element.subitems
                  .flatMap((s) => s.column_values)
                  .filter((s) => s.id === ConstColumn.SubStudentBinder.NumberOfSessions)
                  .map((s) => _.parseInt(s.text || '0')),
              ) ?? null;
            const level = _.parseInt(this.getColumnValuesById(element, ConstColumn.StudentBinder.SubjectLevel));
            const { cw1, cw2 } = this.getColumnWriting(level);

            const grammar = _.filter(element.subitems, (s) => {
              return s.name === 'Grammar';
            })?.[0];

            const punctuation = _.filter(element.subitems, (s) => {
              return s.name === 'Punctuation';
            })?.[0];
            if (cw1 && cw2) {
              data.push({
                range: `${this.sheetToUpdate}!${cw1}127:${cw2}130`,
                majorDimension: 'ROWS',
                values: [
                  [Number(lessonWriting) ?? 0, Number(numberOfSession) ?? 0],
                  // [date?.length ? moment(date)?.format('MM/DD/YYYY') ?? null : null],
                  [date?.length ? (date ?? null) : null],
                  [
                    Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PreTest)) / 100 || 0,
                    Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PostTest)) / 100 || 0,
                  ],
                  [
                    Number(this.getColumnValuesById(punctuation, ConstColumn.SubStudentBinder.PreTest)) / 100 || 0,
                    Number(this.getColumnValuesById(punctuation, ConstColumn.SubStudentBinder.PostTest)) / 100 || 0,
                  ],
                ],
              });
              // switch (cw1) {
              //   case 'Q':
              //     data.push({
              //       range: `${this.sheetToUpdate}!${cw1}127:${cw2}129`,
              //       majorDimension: 'ROWS',
              //       values: [
              //         [Number(lessonWriting) ?? 0, Number(numberOfSession) ?? 0],
              //         [date?.length ? date ?? null : null],
              //         // [date?.length ? moment(date)?.format('MM/DD/YYYY') ?? null : null],
              //         [
              //           Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PreTest)) / 100 || 0,
              //           Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PostTest)) / 100 || 0,
              //         ],
              //       ],
              //     });
              //     break;
              //   case 'S':
              //   case 'U':
              //   case 'W':
              //     data.push({
              //       range: `${this.sheetToUpdate}!${cw1}127:${cw2}128`,
              //       majorDimension: 'ROWS',
              //       values: [
              //         [Number(lessonWriting) ?? 0, Number(numberOfSession) ?? 0],
              //         [date?.length ? date ?? null : null],
              //         // [date?.length ? moment(date)?.format('MM/DD/YYYY') ?? null : null],
              //         // [
              //         //   Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PreTest)) / 100 || 0,
              //         //   Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PostTest)) / 100 || 0,
              //         // ],
              //       ],
              //     });
              //     break;
              //   default:
              //     data.push({
              //       range: `${this.sheetToUpdate}!${cw1}127:${cw2}130`,
              //       majorDimension: 'ROWS',
              //       values: [
              //         [Number(lessonWriting) ?? 0, Number(numberOfSession) ?? 0],
              //         // [date?.length ? moment(date)?.format('MM/DD/YYYY') ?? null : null],
              //         [date?.length ? date ?? null : null],
              //         [
              //           Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PreTest)) / 100 || 0,
              //           Number(this.getColumnValuesById(grammar, ConstColumn.SubStudentBinder.PostTest)) / 100 || 0,
              //         ],
              //         [
              //           Number(this.getColumnValuesById(punctuation, ConstColumn.SubStudentBinder.PreTest)) / 100 || 0,
              //           Number(this.getColumnValuesById(punctuation, ConstColumn.SubStudentBinder.PostTest)) / 100 || 0,
              //         ],
              //       ],
              //     });
              //     break;
              // }
            }
          }
          //End Writing 124 - 130
          //Hours per month per subject AF43- AQ47
          // Thay thế lấy dữ liệu từ sessionFeedbackLog sang lấy từ studentBinderData
          function countByMonthFromSubitems(subitems) {
            const monthMap = {
              '01': 'jan',
              '02': 'feb',
              '03': 'mar',
              '04': 'apr',
              '05': 'may',
              '06': 'jun',
              '07': 'jul',
              '08': 'aug',
              '09': 'sept',
              '10': 'oct',
              '11': 'nov',
              '12': 'dec',
            };
            const result = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
            for (const sub of subitems || []) {
              const dateCol = (sub.column_values || []).find((cv) => cv.id === 'date0' && cv.text);
              if (dateCol && dateCol.text && dateCol.text.length >= 7) {
                const mm = dateCol.text.substring(5, 7);
                const mKey = monthMap[mm];
                if (mKey) result[mKey]++;
              }
            }
            return result;
          }
          // brReading: tổng hợp subitems của tất cả beginning reader
          let brReading = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
          for (const br of studentBinderData?.sbdBeginningReader || []) {
            const r = countByMonthFromSubitems(br.subitems);
            Object.keys(brReading).forEach((k) => (brReading[k] += r[k]));
          }
          // sbdReadingSubitem đã có ở trên
          // readingVoc: name bắt đầu bằng 'Vocabulary Skills'
          let readingVoc = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
          for (const sub of sbdReadingSubitem || []) {
            if (sub.name && sub.name.startsWith('Vocabulary Skills')) {
              const r = countByMonthFromSubitems([sub]);
              Object.keys(readingVoc).forEach((k) => (readingVoc[k] += r[k]));
            }
          }
          // readingCom: name bắt đầu bằng 'Comprehension Skills'
          let readingCom = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
          for (const sub of sbdReadingSubitem || []) {
            if (sub.name && sub.name.startsWith('Comprehension Skills')) {
              const r = countByMonthFromSubitems([sub]);
              Object.keys(readingCom).forEach((k) => (readingCom[k] += r[k]));
            }
          }
          // mathMonth: tổng hợp subitems của tất cả math
          let mathMonth = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
          for (const m of studentBinderData?.sbdMath || []) {
            const r = countByMonthFromSubitems(m.subitems);
            Object.keys(mathMonth).forEach((k) => (mathMonth[k] += r[k]));
          }
          // writing: tổng hợp subitems của tất cả writing
          let writing = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
          for (const w of studentBinderData?.sbdWriting || []) {
            const r = countByMonthFromSubitems(w.subitems);
            Object.keys(writing).forEach((k) => (writing[k] += r[k]));
          }
          // tutorUp giữ nguyên lấy từ sessionFeedbackLog nếu cần, hoặc set 0 nếu không lấy được từ binderData
          let tutorUp = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
          if (tutorUpSubitems?.length) {
            const monthMap = {
              '01': 'jan',
              '02': 'feb',
              '03': 'mar',
              '04': 'apr',
              '05': 'may',
              '06': 'jun',
              '07': 'jul',
              '08': 'aug',
              '09': 'sept',
              '10': 'oct',
              '11': 'nov',
              '12': 'dec',
            };

            tutorUp = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };

            for (const subitem of tutorUpSubitems) {
              const dateCol = subitem.column_values.find((cv) => cv.id === 'date0' && cv.text);
              if (dateCol?.text) {
                const date = new Date(dateCol.text);
                if (!isNaN(date.getTime())) {
                  const month = date.getMonth() + 1; // getMonth() returns 0-11
                  const monthKey = monthMap[month < 10 ? `0${month}` : `${month}`];
                  if (monthKey) {
                    tutorUp[monthKey]++;
                  }
                }
              }
            }
          }
          // Ghi dữ liệu ra sheet
          data.push({
            range: `${this.sheetToUpdate}!AF43:AQ48`,
            majorDimension: 'ROWS',
            values: [
              [
                brReading.jan,
                brReading.feb,
                brReading.mar,
                brReading.apr,
                brReading.may,
                brReading.jun,
                brReading.jul,
                brReading.aug,
                brReading.sept,
                brReading.oct,
                brReading.nov,
                brReading.dec,
              ],
              [
                readingVoc.jan,
                readingVoc.feb,
                readingVoc.mar,
                readingVoc.apr,
                readingVoc.may,
                readingVoc.jun,
                readingVoc.jul,
                readingVoc.aug,
                readingVoc.sept,
                readingVoc.oct,
                readingVoc.nov,
                readingVoc.dec,
              ],
              [
                readingCom.jan,
                readingCom.feb,
                readingCom.mar,
                readingCom.apr,
                readingCom.may,
                readingCom.jun,
                readingCom.jul,
                readingCom.aug,
                readingCom.sept,
                readingCom.oct,
                readingCom.nov,
                readingCom.dec,
              ],
              [
                mathMonth.jan,
                mathMonth.feb,
                mathMonth.mar,
                mathMonth.apr,
                mathMonth.may,
                mathMonth.jun,
                mathMonth.jul,
                mathMonth.aug,
                mathMonth.sept,
                mathMonth.oct,
                mathMonth.nov,
                mathMonth.dec,
              ],
              [
                writing.jan,
                writing.feb,
                writing.mar,
                writing.apr,
                writing.may,
                writing.jun,
                writing.jul,
                writing.aug,
                writing.sept,
                writing.oct,
                writing.nov,
                writing.dec,
              ],
              [
                tutorUp.jan,
                tutorUp.feb,
                tutorUp.mar,
                tutorUp.apr,
                tutorUp.may,
                tutorUp.jun,
                tutorUp.jul,
                tutorUp.aug,
                tutorUp.sept,
                tutorUp.oct,
                tutorUp.nov,
                tutorUp.dec,
              ],
            ],
          });
          //End Hours per month per subject AF43- AQ47

          Logger.log(`[ProgressChart] Updating Google Sheet with ${data.length} ranges of data`);
          const rs = await gSheetService.updateMultipleRange(spredSheetId, data);
          Logger.log(`[ProgressChart] Google Sheet update result: ${JSON.stringify(rs)}`);

          const sheetId = await gSheetService.changeSheetDeleteSheetByName(
            spredSheetId,
            this.sheetToUpdate,
            moment().format('MM/DD/YYYY'),
            moment().format('MM/DD/YYYY'),
          );
          Logger.log(`[ProgressChart] Created new sheet with ID: ${sheetId}`);

          const pdfWebViewLink = await gDriveService.exportSingleSheetToPDF(spredSheetId, sheetId, `Achievement Chart Progress - ${studentName}`);
          Logger.log(`[ProgressChart] Generated PDF link: ${pdfWebViewLink}`);
          // const fileInfo = await gDriveService.getFileInfo(spredSheetId);

          const columnValues = {
            link0__1: { url: `https://docs.google.com/spreadsheets/d/${spredSheetId}?gid=${sheetId}`, text: 'Progress Report' },
            link_mkq0nwdf: { url: pdfWebViewLink, text: 'Progress Report PDF' },
            status_1__1: Constants.Done,
            text_mks7m3nd: `${spredSheetId}`,
            text_mks7mfa9: `${moment().format('MM/DD/YYYY')}`,
          };
          await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SD, pulseId, columnValues);
          Logger.log(`[ProgressChart] Updated Monday.com item with progress report links`);
          //
          await LogService.DoneLog({ dbData, result: 'Successfully' });
          Logger.log(`[ProgressChart] Progress chart generation completed successfully for student ${studentId}`);
        }
        isRetry = false;
      } catch (ex) {
        isRetry = true;
        Logger.log(`[ProgressChart] Exception occurred: ${ex}`);
        await LogService.ExceptionLog({
          dbData,
          ex,
          message: `======${EventName.PR} ${pulseId | payload?.pulseName} Exception=======`,
        });
      } finally {
        retry++;
        if (isRetry) {
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }
        if (retry > 10) {
          isRetry = false;
        }
      }
    }
  }
  static calculateAverages(allReading: any[], itemName: string = null) {
    const calculateAverageForSubitems = (subitems: any[], prefix: string): number => {
      const filteredSubitems = itemName?.length ? subitems?.filter((subitem: any) => subitem.name.startsWith(prefix)) : [...subitems];

      const totalSum = filteredSubitems.reduce((sum: number, subitem: any) => {
        const numbers12Column = subitem.column_values.find((col: any) => col.id === 'numbers12');
        const value = numbers12Column?.value ? parseFloat(numbers12Column.value.replace(/"/g, '').trim()) : 0;
        return sum + value;
      }, 0);

      return filteredSubitems.length ? totalSum / filteredSubitems.length : 0;
    };
    const rs = calculateAverageForSubitems(allReading, itemName);

    return rs;
  }

  static async searchFileChartProgress(studentDatabaseItem) {
    // await gDriveService.authorize();
    // await gDriveService.delete('1Bq79Kxv_EZcVHIQgvBn-HHOZF5PyoLrFC9kGUgmxdCE');
    const studentName = studentDatabaseItem.name;
    const studentId = this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.StudentID);
    const accountId = this.getColumnValuesById(studentDatabaseItem, ConstColumn.SD.AccountID);
    const rs = await gDriveService.search(
      `trashed=false and name contains 'Achievement Chart Progress - ${studentName}' or name contains '| ${studentId}' or name contains '| ${accountId}'`,
    );
    if (rs?.length) {
      const fileName = `Achievement Chart Progress - ${studentName}`;
      const fileArchive = rs.filter((s) => s.name === fileName)?.[0];
      const folderStudent = rs.filter((s) => s.name?.includes(`| ${studentId}`))?.[0];
      const folderFamily = rs.filter((s) => s.name?.includes(`| ${accountId}`))?.[0];
      if (fileArchive?.id) {
        const allSheets = await gSheetService.getAllSheet(fileArchive.id);
        const _blank = allSheets?.filter((s) => s.properties?.title === Constants.SheetNameBlank);
        // if (_blank?.length) {
        //   await gSheetService.changeSheetName(
        //     fileArchive.id,
        //     _blank[0].properties?.sheetId,
        //     `${Constants.SheetNameBlank}_old_${moment().format('MM/DD/YYYY')}`,
        //   );
        // }
        const blankSpreadSheetId = await gSheetService.getSheetIdByName(Constants.ProgressChartTemplateFileId, Constants.SheetNameBlank);
        if (blankSpreadSheetId) {
          const rs = await gSheetService.copySheet(Constants.ProgressChartTemplateFileId, blankSpreadSheetId, fileArchive.id);
          if (rs?.data?.sheetId) {
            this.sheetToUpdate = rs.data.title ?? Constants.SheetNameBlank;
            return fileArchive.id;
          }
        }
      } else {
        if (!folderFamily) {
          this.updateProgressReportStatus(studentDatabaseItem.id, Constants.MissingFamilyGDriveFolder);
          return;
        }
        if (folderStudent) {
          this.sheetToUpdate = Constants.SheetNameBlank;
          const rs = await gDriveService.copyFile(Constants.ProgressChartTemplateFileId, fileName, folderStudent.id, 'application/vnd.google-apps.spreadsheet');
          return rs?.id;
        } else {
          this.updateProgressReportStatus(studentDatabaseItem.id, Constants.MissingStudentGDriveFolder);
          return;
        }
      }
    }
    return;
  }

  static async updateProgressReportStatus(itemId, label) {
    const rs = await BlabMondayService.ChangeSimpleColumnValue(BoardConstants.SD, itemId, ConstColumn.SD.ProgressChartStatus, label);
    return rs?.data?.change_simple_column_value?.id ? true : false;
  }

  static getTextStudentDatabase(column_values) {
    let grade = null;
    let sessionsCompleted = null;
    let hoursRemaining = null;
    let sessionperWeek = null;
    for (let i = 0; i < column_values?.length; i++) {
      const cValue = column_values[i];
      switch (cValue.id) {
        case ConstColumn.SD.Grade:
          grade = cValue.text;
          break;
        case ConstColumn.SD.SessionPerWeek:
          sessionperWeek = cValue.text;
          break;
        case ConstColumn.SD.HoursRemaining:
          hoursRemaining = cValue.display_value;
          break;
        case ConstColumn.SD.NumberOfSession:
          sessionsCompleted = cValue.text;
          break;
      }
    }

    return { grade, sessionperWeek, sessionsCompleted, hoursRemaining };
  }

  static getBinderData(column_values) {
    let tuSession = null;
    let sharpBRLSLessons = null;
    let sharpBRPhonicsLessons = null;
    let sharpBRLSSessions = null;
    let sharpBRPhonicsSessions = null;
    let timeOnReading = null;
    let readingLevelsCompleted = null;
    let timeOnMath = null;
    let timeOnWriting = null;
    for (let i = 0; i < column_values?.length; i++) {
      const cValue = column_values[i];
      switch (cValue.id) {
        case ConstColumn.BinderAnalyticsData.TUSession:
          tuSession = this.sumArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.SharpBRLSLessons:
          sharpBRLSLessons = this.sumArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.SharpBRPhonicsLessons:
          sharpBRPhonicsLessons = this.sumArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.SharpBRLSSessions:
          sharpBRLSSessions = this.maxArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.SharpBRPhonicsSessions:
          sharpBRPhonicsSessions = this.maxArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.TimeOnReading:
          timeOnReading = this.sumArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.ReadingLevelsCompleted:
          readingLevelsCompleted = cValue.text || null;
          break;
        case ConstColumn.BinderAnalyticsData.TimeOnMath:
          timeOnMath = this.sumArray(cValue.display_value);
          break;
        case ConstColumn.BinderAnalyticsData.TimeOnWriting:
          timeOnWriting = this.sumArray(cValue.display_value);
          break;
      }
    }
    return {
      tuSession,
      sharpBRLSLessons,
      sharpBRPhonicsLessons,
      sharpBRLSSessions,
      sharpBRPhonicsSessions,
      timeOnReading,
      readingLevelsCompleted,
      timeOnMath,
      timeOnWriting,
    };
  }

  static getStudentBinderData(sources) {
    let sbdBeginningReader: any = [];
    let sbdWordAttack: any = [];
    let sbdReading: any = [];
    let sbdMathFacts: any = [];
    let sbdMath: any = [];
    let sbdWriting: any = [];
    if (sources?.length) {
      for (const group of sources) {
        const items = group?.items_page?.items || [];
        switch (group?.title) {
          case StudentBinderConst.Group.BeginningReader:
            sbdBeginningReader = items;
            break;
          case StudentBinderConst.Group.WordAttack:
            sbdWordAttack = items;
            break;
          case StudentBinderConst.Group.Reading:
            sbdReading = items;
            break;
          case StudentBinderConst.Group.MathFacts:
            sbdMathFacts = items;
            break;
          case StudentBinderConst.Group.Math:
            sbdMath = items;
            break;
          case StudentBinderConst.Group.Writing:
            sbdWriting = items;
            break;
        }
      }
    }
    // for (let i = 0; i < sources?.length; i++) {
    //   const element = sources[i];
    //   switch (element?.group?.title) {
    //     case StudentBinderConst.Group.BeginningReader:
    //       sbdBeginningReader.push(element?.item_pages?.items);
    //       break;
    //     case StudentBinderConst.Group.WordAttack:
    //       sbdWordAttack.push(element);
    //       break;
    //     case StudentBinderConst.Group.Reading:
    //       sbdReading.push(element);
    //       break;
    //     case StudentBinderConst.Group.MathFacts:
    //       sbdMathFacts.push(element);
    //       break;
    //     case StudentBinderConst.Group.Math:
    //       sbdMath.push(element);
    //       break;
    //     case StudentBinderConst.Group.Writing:
    //       sbdWriting.push(element);
    //       break;
    //   }

    return { sbdBeginningReader, sbdWordAttack, sbdReading, sbdMathFacts, sbdMath, sbdWriting };
  }

  static getMathFactDetails(source) {
    return (source || []).reduce(
      (acc, element) => {
        const sum = (element.subitems || []).reduce((total, sub) => {
          const cv = sub.column_values.find((c) => c.id === ConstColumn.SubStudentBinder.NumberOfLession);
          const num = cv ? parseInt((cv.text ?? '0').toString(), 10) || 0 : 0;
          return total + num;
        }, 0);

        switch (element.name) {
          case 'Addition':
            acc.addition = sum;
            break;
          case 'Subtraction':
            acc.subtraction = sum;
            break;
          case 'Multiplication':
            acc.multiplication = sum;
            break;
        }
        return acc;
      },
      { addition: 0, subtraction: 0, multiplication: 0 },
    );

    // let addition = 0;
    // let subtraction = 0;
    // let multiplication = 0;
    // for (let i = 0; i < source?.length; i++) {
    //   const element = source[i];
    //   let sum = 0;
    //   const subs = element.subitems;
    //   if (subs) {
    //     for (let i = 0, len = subs.length; i < len; i++) {
    //       const cvs = subs[i].column_values;
    //       for (let j = 0, clen = cvs.length; j < clen; j++) {
    //         const cv = cvs[j];
    //         if (cv.id === ConstColumn.SubStudentBinder.NumberOfLession) {
    //           const num = cv.value != null ? parseInt(cv.value as string, 10) : cv.text != null ? parseInt(cv.text, 10) : 0;
    //           sum += isNaN(num) ? 0 : num;
    //           break;
    //         }
    //       }
    //     }
    //   }
    //   switch (element.name) {
    //     case 'Addition':
    //       addition = sum;
    //       break;
    //     case 'Subtraction':
    //       subtraction = sum;
    //       break;
    //     case 'Multiplication':
    //       multiplication = sum;
    //       break;
    //   }
    // }

    // return { addition, subtraction, multiplication };
  }

  static getColumnValuesById(source, id, getValueType = 0) {
    const rs = source?.column_values?.filter((s) => s.id === id)?.[0];
    return (getValueType === 0 ? rs?.text || null : getValueType === 1 ? rs?.value || null : getValueType === 2 ? rs?.display_value || null : null) || null;
  }

  static avgSessionFeedbackLog(sources) {
    let effort = 0;
    let behavior = 0;
    let understanding = 0;
    if (sources?.length) {
      const sessionDetails = _.filter(sources, (s) =>
        s.column_values.some((cl) => cl.id === ConstColumn.SessionFeedbackLog.Type && cl.text === 'Session Details'),
      );
      const arrayColumnValues = _.flatMap(sessionDetails, 'column_values');

      const cal = (id) => {
        const tmp = _.filter(arrayColumnValues, (s) => {
          if (s.id === id && s.text?.length) {
            return s;
          }
        });
        return tmp?.length > 0 ? _.round(_.sum(_.map(tmp, (s) => _.parseInt(s.text || '0'))) / tmp.length, 1) : 0;
      };

      effort = cal(ConstColumn.SessionFeedbackLog.Effort);
      behavior = cal(ConstColumn.SessionFeedbackLog.Behavior);
      understanding = cal(ConstColumn.SessionFeedbackLog.Understanding);
    }

    // const behavior = _.sum(
    //   _.map(
    //     _.filter(arrayColumnValues, (s) => {
    //       if (s.id === ConstColumn.SessionFeedbackLog.Behavior && s.text?.length) {
    //         return s;
    //       }
    //     }),
    //     (s) => _.parseInt(s.text),
    //   ),
    // );

    // const understanding = _.sum(
    //   _.map(
    //     _.filter(arrayColumnValues, (s) => {
    //       if (s.id === ConstColumn.SessionFeedbackLog.Understanding && s.text?.length) {
    //         return s;
    //       }
    //     }),
    //     (s) => _.parseInt(s.text),
    //   ),
    // );
    return { effort, behavior, understanding };
  }

  static getRowNumberReading(name) {
    let n1 = 0;
    let n2 = 0;
    switch (name) {
      case 'Vocabulary Skills | SRA':
        n1 = 27;
        n2 = 28;
        break;
      case 'Vocabulary Skills | UC':
        n1 = 29;
        n2 = 30;
        break;
      case 'Vocabulary Skills | MMM':
        n1 = 31;
        n2 = 32;
        break;
      case 'Vocabulary Skills | RWR':
        n1 = 33;
        n2 = 34;
        break;
      case 'Vocabulary Skills | VW':
        n1 = 35;
        n2 = 36;
        break;
      case 'Vocabulary Skills | VD Drills':
      case 'Enrichment Skills | SOV':
        n1 = 37;
        n2 = 38;
        break;
      case 'Vocabulary Skills | RAW':
        n1 = 39;
        n2 = 40;
        break;
      case 'Comprehension Skills | SRA':
        n1 = 43;
        n2 = 44;
        break;
      case 'Comprehension Skills | FD':
        n1 = 45;
        n2 = 46;
        break;
      case 'Comprehension Skills | GMI':
        n1 = 47;
        n2 = 48;
        break;
      case 'Comprehension Skills | DS':
        n1 = 49;
        n2 = 50;
        break;
      case 'Comprehension Skills | GF':
        n1 = 51;
        n2 = 52;
        break;
      case 'Comprehension Skills | DC':
        n1 = 53;
        n2 = 54;
        break;
      case 'Comprehension Skills | II':
        n1 = 55;
        n2 = 56;
        break;
    }
    return { n1, n2 };
  }

  static getColumnReading(level) {
    let c1 = '';
    let c2 = '';
    let c3 = '';
    switch (_.parseInt(level)) {
      case 1:
        c1 = 'C';
        c2 = 'D';
        c3 = 'C';
        break;
      case 2:
        c1 = 'E';
        c2 = 'F';
        c3 = 'E';
        break;
      case 3:
        c1 = 'G';
        c2 = 'H';
        c3 = 'G';
        break;
      case 4:
        c1 = 'I';
        c2 = 'J';
        c3 = 'I';
        break;
      case 5:
        c1 = 'K';
        c2 = 'L';
        c3 = 'K';
        break;
      case 6:
        c1 = 'M';
        c2 = 'N';
        c3 = 'M';
        break;
      case 7:
        c1 = 'O';
        c2 = 'P';
        c3 = 'O';
        break;
      case 8:
        c1 = 'Q';
        c2 = 'R';
        c3 = 'Q';
        break;
      case 9:
        c1 = 'S';
        c2 = 'T';
        c3 = 'S';
        break;
      case 10:
        c1 = 'U';
        c2 = 'V';
        c3 = 'U';
        break;
      case 11:
        c1 = 'W';
        c2 = 'X';
        c3 = 'W';
        break;
      case 12:
        c1 = 'Y';
        c2 = 'Z';
        c3 = 'Y';
        break;
    }

    return { c1, c2, c3 };
  }

  static sumArray(source) {
    return _.sum(this.splitStringToNumber(source)) || null;
  }

  static maxArray(source) {
    return _.max(this.splitStringToNumber(source)) || null;
  }

  static splitStringToNumber(source, seperator = ', ') {
    return _.map(_.split(source, seperator), (s) => _.parseInt(s || '0'));
  }

  static getColumnMath(level) {
    let cm1, cm2;
    switch (level) {
      case 1:
        cm1 = 'A';
        cm2 = 'D';
        break;
      case 2:
        cm1 = 'E';
        cm2 = 'H';
        break;
      case 3:
        cm1 = 'I';
        cm2 = 'L';
        break;
      case 4:
        cm1 = 'M';
        cm2 = 'P';
        break;
      case 5:
        cm1 = 'Q';
        cm2 = 'T';
        break;
      case 6:
        cm1 = 'U';
        cm2 = 'X';
        break;
      case 7:
        cm1 = 'Y';
        cm2 = 'AB';
        break;
    }

    return { cm1, cm2 };
  }

  static getRowMath(name) {
    let rm1, rm2;
    if (name?.length) {
      if (name.startsWith('Addition')) {
        rm1 = 73;
        rm2 = 74;
      }
      if (name.startsWith('Subtraction')) {
        rm1 = 77;
        rm2 = 78;
      }
      if (name.startsWith('Multiplication')) {
        rm1 = 81;
        rm2 = 82;
      }
      if (name.startsWith('Division')) {
        rm1 = 85;
        rm2 = 86;
      }
      if (name.startsWith('Fractions')) {
        rm1 = 89;
        rm2 = 90;
      }
      if (name.startsWith('Decimals')) {
        rm1 = 93;
        rm2 = 94;
      }
      if (name.startsWith('Ratios Proportions and Percents')) {
        rm1 = 97;
        rm2 = 98;
      }
      if (name.startsWith('Numerations')) {
        rm1 = 101;
        rm2 = 102;
      }
      if (name.startsWith('Word Problems')) {
        rm1 = 105;
        rm2 = 106;
      }
      if (name.startsWith('Measures & Geometric Figures')) {
        rm1 = 109;
        rm2 = 110;
      }
      if (name.startsWith('Equations')) {
        rm1 = 113;
        rm2 = 114;
      }
      if (name.startsWith('Integers')) {
        rm1 = 116;
        rm2 = 117;
      }
      if (name.startsWith('Intro- Algebra')) {
        rm1 = 121;
        rm2 = 122;
      }
    }

    return { rm1, rm2 };
  }

  static getColumnWriting(level) {
    let cw1, cw2;
    switch (level) {
      case 2:
        cw1 = 'E';
        cw2 = 'F';
        break;
      case 3:
        cw1 = 'G';
        cw2 = 'H';
        break;
      case 4:
        cw1 = 'I';
        cw2 = 'J';
        break;
      case 5:
        cw1 = 'K';
        cw2 = 'L';
        break;
      case 6:
        cw1 = 'M';
        cw2 = 'N';
        break;
      case 7:
        cw1 = 'O';
        cw2 = 'P';
        break;
      case 8:
        cw1 = 'Q';
        cw2 = 'R';
        break;
      case 9:
        cw1 = 'S';
        cw2 = 'T';
        break;
      case 10:
        cw1 = 'U';
        cw2 = 'V';
        break;
      case 11:
        cw1 = 'W';
        cw2 = 'X';
        break;
    }

    return { cw1, cw2 };
  }

  static getSubjectPerMonth(month) {
    let jan = 0,
      feb = 0,
      mar = 0,
      apr = 0,
      may = 0,
      jun = 0,
      jul = 0,
      aug = 0,
      sept = 0,
      oct = 0,
      nov = 0,
      dec = 0;
    switch (month) {
      case 1:
        jan = 1;
        break;
      case 2:
        feb = 1;
        break;
      case 3:
        mar = 1;
        break;
      case 4:
        apr = 1;
        break;
      case 5:
        may = 1;
        break;
      case 6:
        jun = 1;
        break;
      case 7:
        jul = 1;
        break;
      case 8:
        aug = 1;
        break;
      case 9:
        sept = 1;
        break;
      case 10:
        oct = 1;
        break;
      case 11:
        nov = 1;
        break;
      case 12:
        dec = 1;
        break;
    }
    return { jan, feb, mar, apr, may, jun, jul, aug, sept, oct, nov, dec };
  }

  static initPerMonth() {
    return { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sept: 0, oct: 0, nov: 0, dec: 0 };
  }

  static minutesToHours(minutes) {
    return _.round(minutes / 60, 2);
  }

  static getStudentBinderPercent(math, name) {
    const data = _.filter(math, (s) => s.name?.startsWith(name));
    let percentMathAdditionTotal = 0;
    for (let i = 0; i < data?.length; i++) {
      const element = data[i];

      const percent = this.getColumnValuesById(element, ConstColumn.StudentBinder.PercentCompleted, 2);
      percentMathAdditionTotal += _.sum(percent?.split(', ')?.map(Number)) / percent?.split(', ')?.length;
    }
    return data?.length ? percentMathAdditionTotal / data?.length : 0;
  }

  static countBySubjectAndMonth(items) {
    // const allowed = new Set(['BR-Phonics', 'BR-LS', 'Reading-Vocab', 'Reading-Comprehension', 'Math', 'Writing', 'Tutor up']);
    // // kết quả: { subject: { month: count, ... }, ... }
    // const counts: Record<string, Record<string, number>> = {};
    // for (const item of items) {
    //   let subject: string | undefined;
    //   let dateText: string | undefined;
    //   // chỉ lặp tối đa 2 phần tử và break sớm khi đủ
    //   for (const cv of item.column_values) {
    //     if (cv.id === 'dropdown2') {
    //       subject = cv.text;
    //     } else if (cv.id === 'date4') {
    //       dateText = cv.text;
    //     }
    //     if (subject && dateText) break;
    //   }
    //   // bỏ qua nếu thiếu hoặc không trong danh sách allowed
    //   if (!subject || !dateText || !allowed.has(subject)) continue;
    //   // lấy tháng MM
    //   const month = dateText.substring(5, 7);
    //   // khởi tạo nếu chưa có
    //   if (!counts[subject]) {
    //     counts[subject] = {};
    //   }
    //   // đếm
    //   counts[subject][month] = (counts[subject][month] ?? 0) + 1;
    // }
    // return counts;
  }
}
