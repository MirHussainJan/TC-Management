import { get } from 'http';
import ConstColumn from '../../constants/constant-column';
import Logger from '../../helper/logger';
import BlabMondayService from '../blab-monday.service';
import knackService from '../knack.service';
import { BoardConstants } from '../../constants/constant';
import SlackService from '../other-business/slack.service';
import LogService from '../log-service';
import moment from 'moment';

const SLACK_WEBHOOK_READING_STOP_LEVEL = process.env.SLACK_WEBHOOK_READING_STOP_LEVEL || '';

export async function readingCurriculumToMonday(bodyData) {
  const { subject, date, text, html, from, to, cc, bcc, attachments } = bodyData;

  let logData = {
    board_id: 0,
    item_id: 0,
    item_name: subject,
    board_name: '',
    event_name: 'Reading Curriculum To Monday',
    event_data: bodyData,
    monday_item_id: 0,
  };
  let mondayLog = null;
  let result;
  try {
    try {
      const started = await LogService.StartLog(logData);
      mondayLog = started?.mondayLog || null;
    } catch (logError) {
      Logger.log(`StartLog failed in readingCurriculumToMonday: ${logError}`);
    }

    const search = await knackService.getRecords('object_50', {
      sort_field: ConstColumn.Knack.ReadingCurriculumnCopy.RecordId,
      sort_order: 'desc',
      filters: { match: 'and', rules: [{ field: ConstColumn.Knack.ReadingCurriculumnCopy.RecordId, operator: 'is', value: subject }] },
    });
    const searchBySubject = search?.records?.[0] || [];
    if (searchBySubject.field_735_raw) {
      const searchMonday = await BlabMondayService.GetItemsPageByColumnValues(
        searchBySubject.field_1038_raw,
        [
          {
            column_id: 'name',
            column_values: `${
              !isNaN(searchBySubject.field_1041_raw)
                ? searchBySubject.field_1041_raw?.endsWith('.0')
                  ? searchBySubject.field_1041_raw
                  : searchBySubject.field_1041_raw + '.0'
                : searchBySubject.field_1041_raw
            }`,
          },
        ],
        ['status5'],
      );
      result = { msg: `search on monday: ${searchMonday?.length}` };
      searchMonday?.forEach(async (item) => {
        Logger.log(`Reading Curriculum found on Monday: ${JSON.stringify(item)}`);
        if (item.group?.id === 'group_title') {
          const getItemWithSubitem = await BlabMondayService.GetItemById(item.id, [], false, false, true);
          const updateMonday = await BlabMondayService.ChangeSimpleColumnValue(searchBySubject.field_1038_raw, item.id, 'status5', 'Active');
          Logger.log(`Reading Curriculum Updated to Active on Monday: ${JSON.stringify(updateMonday)}`);
          if (getItemWithSubitem.subitems?.length > 0) {
            getItemWithSubitem.subitems.forEach(async (subitem) => {
              if (subitem.name === searchBySubject.field_1053) {
                const skipped = await SkippedLessonSessions(searchBySubject);
                //IN PROGRESS
                if (searchBySubject.field_751?.toLowerCase() === 'in progress' && (!searchBySubject.field_1685 || searchBySubject.field_1685 === 'No')) {
                  const inProgressResult = await inProgress(subitem, searchBySubject, skipped);
                }

                //Levels Completed
                if (searchBySubject.field_1685 === 'Yes') {
                  await levelCompleted(subitem, searchBySubject, skipped);
                  const mondayGroup = await BlabMondayService.GetBoardListGroup(searchBySubject.field_1038);
                  const readingGroups = mondayGroup?.groups?.filter((g) => g.title === 'Reading');
                  if (readingGroups.length > 0) {
                    for (const group of readingGroups) {
                      const listReadingGroups = await BlabMondayService.GetGroupListItem(searchBySubject.field_1038, [group.id]);
                      const readingGroupItems = listReadingGroups?.[0]?.items;
                      if (readingGroupItems?.length > 0) {
                        let totalAggregated = 0;
                        for (const item of readingGroupItems) {
                          // Lấy giá trị cột cần split (ví dụ: column 'text0')
                          const columnValue = getColumnValuesById(item, 'lookup');

                          // Split ra array
                          const arrayValues = columnValue?.split(',').map((v) => parseFloat(v.trim())) || [];

                          // Tính sum và length
                          const sum = arrayValues?.reduce((a, b) => a + b, 0);
                          const length = arrayValues?.length;

                          // Tính giá trị của item này (sum/length)
                          const itemValue = length > 0 ? sum / length : 0;

                          // Cộng vào tổng
                          totalAggregated += itemValue;
                        }
                        const levelCompleted = totalAggregated / 100;
                        //Students knack
                        const searchStudent = await knackService.getRecords('object_1', {
                          sort_field: 'field_1',
                          sort_order: 'desc',
                          filters: {
                            match: 'and',
                            rules: [{ field: 'field_1', operator: 'is', value: searchBySubject.field_1298 }],
                          },
                        });

                        if (searchStudent.records.length > 0) {
                          const binderAnalyticsData = await BlabMondayService.GetItemsPageByColumnValues(
                            BoardConstants.BinderAnalyticsData,
                            { column_id: ConstColumn.BinderAnalyticsData.StudentId, column_values: `${searchStudent.records[0].field_952}` },
                            [ConstColumn.BinderAnalyticsData.StudentId],
                          );
                          if (binderAnalyticsData.length > 0) {
                            const updatedReadingLevel = await BlabMondayService.ChangeSimpleColumnValue(
                              BoardConstants.BinderAnalyticsData,
                              binderAnalyticsData[0].id,
                              ConstColumn.BinderAnalyticsData.ReadingLevelsCompleted,
                              levelCompleted,
                            );
                            Logger.log(`Binder Analytics Data Reading Levels Completed Updated: ${JSON.stringify(updatedReadingLevel)}`);
                          }
                        }

                        Logger.log(`Total Aggregated Value: ${totalAggregated}`);
                      }
                    }
                  }
                }

                //Reading Stop Level
                if (searchBySubject.field_728_raw?.[0]?.id) {
                  const studentReadingStopLevel = await knackService.getRecord('object_1', searchBySubject.field_728_raw?.[0]?.id);
                  if (searchBySubject.field_1041_raw == studentReadingStopLevel.field_1637) {
                    const block = [
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: `⚠️STOP LEVEL REACHED ⚠️\n\n*${studentReadingStopLevel.field_17}* has reached the STOP LEVEL for *Reading* at ${studentReadingStopLevel.field_1281}. \nAlert your director to review this student's progress and reset the Stop level from the Knack Binder.\n`,
                        },
                      },
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: `<https://tutoringclubstj.knack.com/tutoring-club#student-binders/view-binder2/${studentReadingStopLevel.id}/reading2/${studentReadingStopLevel.id}/|*Click to View Binder*>\t\t\t\t\t`,
                        },
                      },
                      {
                        type: 'divider',
                      },
                    ];
                    if (SLACK_WEBHOOK_READING_STOP_LEVEL) {
                      await SlackService.sendSlackMessage(SLACK_WEBHOOK_READING_STOP_LEVEL, { blocks: block });
                    }

                    const alertCreateResult = await knackService.createRecord('object_13', {
                      field_152: 'Urgent Alert',
                      field_150: studentReadingStopLevel.id,
                      field_151: '638351b638eedc0022de3e16',
                      field_178: 'The Stop Level has been reached for Reading - Confirm with Admin to proceed',
                      field_182: 'Active',
                    });
                    Logger.log(`Alert Created for STOP LEVEL REACHED: ${JSON.stringify(alertCreateResult)}`);

                    const updateStudent = await knackService.updateRecord('object_1', studentReadingStopLevel.id, {
                      field_1864: 'Yes',
                    });

                    Logger.log(`Student Record Updated after STOP LEVEL REACHED Alert: ${JSON.stringify(updateStudent)}`);
                  }
                }
                result = { msg: `Reading Curriculum Subitem Processed for Monday Item ID: ${item.id}` };
              } else {
                Logger.log(`No Subitems found for Reading Curriculum Item on Monday: ${item.id}`);
                result = { msg: `No Subitems found for Reading Curriculum Item on Monday: ${item.id}` };
              }
            });
          } else {
            Logger.log(`No Subitems found for Reading Curriculum Item on Monday: ${item.id}`);
            result = { msg: `No Subitems found for Reading Curriculum Item on Monday: ${item.id}` };
          }
        } else {
          result = { msg: `Reading Curriculum Item is not in Title Group` };
          Logger.log(`Reading Curriculum Item is not in Title Group: ${JSON.stringify(item)}`);
        }
      });
    } else {
      result = { msg: `No Reading Curriculum found in Knack - Reading Curriculum Copy` };
    }
    if (mondayLog) {
      await LogService.DoneLog({ dbData: mondayLog, result });
    }
    return { status: 200, message: 'Reading curriculum sent to Monday successfully' };
  } catch (error) {
    Logger.log(`Error in readingCurriculumToMonday: ${error}`);
    if (mondayLog) {
      await LogService.ExceptionLog({
        dbData: mondayLog,
        error,
        message: `======Reading Curriculum to Monday ${subject} Exception=======`,
      });
    }
    return { status: 500, message: error };
  }
}

async function SkippedLessonSessions(originalRecord) {
  Logger.log('SkippedLessonSessions Function');
  let skippedLessons = 0;
  let numberOfSessions: number = 0;
  const searchRecords = await knackService.getRecords('object_50', {
    filters: {
      match: 'and',
      rules: [
        { field: 'field_731', operator: 'contains', value: originalRecord.field_731_raw?.[0]?.id || '' },
        { field: 'field_728', operator: 'is', value: originalRecord.field_728_raw?.[0]?.id || '' },
        { field: 'field_762', operator: 'is', value: originalRecord.field_762 || '' },
        { field: 'field_751', operator: 'is', value: 'Skipped' },
      ],
    },
  });
  skippedLessons = searchRecords?.records?.length;
  const search = await knackService.getRecords('object_50', {
    filters: {
      match: 'and',
      rules: [
        { field: 'field_731', operator: 'contains', value: originalRecord.field_731_raw?.[0]?.id || '' },
        { field: 'field_728', operator: 'is', value: originalRecord.field_728_raw?.[0]?.id || '' },
        { field: 'field_762', operator: 'is', value: originalRecord.field_762 || '' },
        { field: 'field_1647', operator: 'is not blank', value: '' },
      ],
    },
  });

  // Numeric Aggregator: COUNT, Group by field_1647_raw.identifier
  const counts = search?.records?.reduce((acc, record) => {
    const identifier = record.field_1647_raw?.[0]?.identifier || 'unknown';
    acc[identifier] = (acc[identifier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Tổng tất cả các sessions
  numberOfSessions = (Object.values(counts) as number[]).reduce((sum: number, count: number) => sum + count, 0);

  Logger.log(`Number of Sessions (total): ${numberOfSessions}`);

  // Nếu muốn lấy result của bản ghi cuối (giống Make.com lấy bundle cuối):
  // const countsArray = Object.entries(counts);
  // const numberOfSessions = countsArray.length > 0 ? countsArray[countsArray.length - 1][1] : 0;
  return { skippedLessons, numberOfSessions };
}

async function inProgress(subitem, originalRecord, skipped) {
  Logger.log('In Progress Function');
  //REPNUMBER
  let repNumber = '';
  const numbers4 = getColumnValuesById(subitem, 'numbers4');
  const numbers1 = getColumnValuesById(subitem, 'numbers1');
  const numbers9 = getColumnValuesById(subitem, 'numbers9');
  const dupOfRep3 = getColumnValuesById(subitem, 'dup__of_rep_3');
  const dupOfRep4 = getColumnValuesById(subitem, 'dup__of_rep_4');
  if (!numbers4.length) {
    repNumber = 'numbers4';
  } else if (!numbers1.length) {
    repNumber = 'numbers1';
  } else if (!numbers9.length) {
    repNumber = 'numbers9';
  } else if (!dupOfRep3.length) {
    repNumber = 'dup__of_rep_3';
  } else if (!dupOfRep4.length) {
    repNumber = 'dup__of_rep_4';
  }

  const searchNonSRA = await knackService.getRecords('object_50', {
    filters: {
      match: 'and',
      rules: [
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.TopicsForLogic, operator: 'contains', value: originalRecord.field_731_raw?.[0]?.id || '' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Student, operator: 'is', value: originalRecord.field_728_raw?.[0]?.id || '' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.LessonBook, operator: 'is', value: originalRecord.field_762 || '' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Status, operator: 'is not', value: 'Archived' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Status, operator: 'is not', value: 'Skipped' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Status, operator: 'is not', value: 'Removed' },
      ],
    },
  });
  const recordNonSRA = searchNonSRA?.records || [];

  if (recordNonSRA.length > 0) {
    //Search Lessons(reading Column)
    const searchLessons = await knackService.getRecords('object_27', {
      filters: {
        match: 'and',
        rules: [
          {
            field: `${!originalRecord.field_1053?.toLowerCase()?.includes('sra') ? 'field_1054' : 'field_216'}`,
            operator: 'is',
            value: originalRecord.field_1053 || '',
          },
          { field: 'field_754', operator: 'is', value: originalRecord.field_762 || '' },
        ],
      },
    });

    if (searchLessons?.records?.length > 0) {
      const lessonRecord = searchLessons.records?.[0] || {};
      let columnValues = {
        status: 'Active',
        // [repNumber]: originalRecord.field_735_raw ? originalRecord.field_735_raw : '',
        text3: `${originalRecord.field_734_raw?.[0]?.identifier || ''}`,
        numbers1__1: recordNonSRA.length,
        numbers12: (recordNonSRA.length / lessonRecord.length) * 100,
        numbers18: skipped.numberOfSessions,
        numbers8: skipped.skippedLessons,
      };
      if (repNumber?.length > 0) {
        columnValues[repNumber] = originalRecord.field_735_raw ? originalRecord.field_735_raw : '';
      }
      const updateMonday = await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, columnValues);
      Logger.log(`Reading Curriculum Subitem Updated to Active on Monday: ${JSON.stringify(updateMonday)}`);
      if (updateMonday?.error_message?.includes("This column ID doesn't exist for the board") && updateMonday?.error_message?.includes('numbers1__1')) {
        const columnValues1 = {
          status: 'Active',
          [repNumber]: originalRecord.field_735_raw ? originalRecord.field_735_raw : '',
          text3: `${originalRecord.field_734_raw?.[0]?.identifier || ''}`,
          numbers12: (recordNonSRA.length / lessonRecord.length) * 100,
          numbers18: skipped.numberOfSessions,
          numbers8: skipped.skippedLessons,
        };
        if (repNumber?.length > 0) {
          columnValues1[repNumber] = originalRecord.field_735_raw ? originalRecord.field_735_raw : '';
        }
        const updateMondayError = await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, columnValues1);
        Logger.log(`Reading Curriculum Subitem Updated to Active on Monday with Error: ${JSON.stringify(updateMondayError)}`);
      }
      await BlabMondayService.CreateUpdate(
        subitem.id,
        `${originalRecord.field_727_raw.date}

Lesson: ${originalRecord.field_734_raw?.[0]?.identifier}
Score: ${originalRecord.field_735_raw}
Notes: ${originalRecord.field_909}
Tutor: ${originalRecord.field_900_raw?.[0]?.identifier}`,
      );

      const updateRecord = await knackService.updateRecord('object_50', originalRecord.id, { field_1488: 'Normal Lesson Update' });
      Logger.log(`Reading Curriculum Knack Record Updated: ${JSON.stringify(updateRecord)}`);
    }
  }
}

async function levelCompleted(subitem, searchBySubject, skipped) {
  Logger.log('Level Completed Function');
  //REPNUMBER
  let repNumber = '';
  const numbers4 = getColumnValuesById(subitem, 'numbers4');
  const numbers1 = getColumnValuesById(subitem, 'numbers1');
  const numbers9 = getColumnValuesById(subitem, 'numbers9');
  const dupOfRep3 = getColumnValuesById(subitem, 'dup__of_rep_3');
  const dupOfRep4 = getColumnValuesById(subitem, 'dup__of_rep_4');
  if (!numbers4.length) {
    repNumber = 'numbers4';
  } else if (!numbers1.length) {
    repNumber = 'numbers1';
  } else if (!numbers9.length) {
    repNumber = 'numbers9';
  } else if (!dupOfRep3.length) {
    repNumber = 'dup__of_rep_3';
  } else if (!dupOfRep4.length) {
    repNumber = 'dup__of_rep_4';
  }

  const searchNonSRA = await knackService.getRecords('object_50', {
    filters: {
      match: 'and',
      rules: [
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.TopicsForLogic, operator: 'contains', value: searchBySubject.field_731_raw?.[0]?.id || '' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Student, operator: 'is', value: searchBySubject.field_728_raw?.[0]?.id || '' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.LessonBook, operator: 'is', value: searchBySubject.field_762 || '' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Status, operator: 'is not', value: 'Archived' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Status, operator: 'is not', value: 'Skipped' },
        { field: ConstColumn.Knack.ReadingCurriculumnCopy.Status, operator: 'is not', value: 'Removed' },
      ],
    },
  });

  const recordNonSRA = searchNonSRA?.records || [];
  if (recordNonSRA.length > 0) {
    // Numeric Aggregator: Average of field_735_raw
    // Lấy tất cả giá trị field_735_raw (kiểu số) trong recordNonSRA
    const values = recordNonSRA
      .map((r) => {
        const v = parseFloat(r.field_735_raw);
        return isNaN(v) ? null : v;
      })
      .filter((v) => v !== null);

    const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    Logger.log(`Average of field_735_raw in recordNonSRA: ${average}`);
    await BlabMondayService.ChangeSimpleColumnValue(subitem.board.id, subitem.id, 'numbers', average);

    if (!searchBySubject.field_1053?.toLowerCase()?.includes('sra')) {
      const updateMonday = await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, {
        [repNumber]: searchBySubject.field_735_raw || '',
        // [repNumber]: originalRecord.field_735_raw ? originalRecord.field_735_raw : '',
        text3: `${searchBySubject.field_734_raw?.[0]?.identifier || ''}`,
        numbers1__1: recordNonSRA.length,
        numbers12: 100,
        status: 'Completed',
        date0: searchBySubject.date ? searchBySubject.date.format('YYYY-MM-DD') : '',
        numbers18: skipped.numberOfSessions,
        numbers8: skipped.skippedLessons,
      });
      if (updateMonday?.error_message?.includes("This column ID doesn't exist for the board") && updateMonday?.error_message?.includes('numbers1__1')) {
        const columnValues1 = {
          status: 'Completed',
          date0: searchBySubject.date ? searchBySubject.date.format('YYYY-MM-DD') : '',
          [repNumber]: searchBySubject.field_735_raw ? searchBySubject.field_735_raw : '',
          text3: `${searchBySubject.field_734_raw?.[0]?.identifier || ''}`,
          numbers12: 100,
          numbers18: skipped.numberOfSessions,
          numbers8: skipped.skippedLessons,
        };
        if (repNumber?.length > 0) {
          columnValues1[repNumber] = searchBySubject.field_735_raw ? searchBySubject.field_735_raw : '';
        }
        const updateMondayError = await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, columnValues1);
        Logger.log(`Reading Curriculum Subitem Updated to Active on Monday with Error: ${JSON.stringify(updateMondayError)}`);
        await knackService.updateRecord('object_50', searchBySubject.id, { field_1488: 'Normal Lesson Update' });
        return;
      }

      await knackService.updateRecord('object_50', searchBySubject.id, { field_1488: 'Completed Lesson Update' });
    } else {
      if (searchBySubject.field_1829 !== 'Yes') {
        //Clear All Reps after a new book
        await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, {
          numbers4: null,
          numbers1: null,
          numbers9: null,
          dup__of_rep_3: null,
          dup__of_rep_4: null,
        });
      }
      let columnValues = {
        [repNumber]: searchBySubject.field_735_raw || '',
        // [repNumber]: originalRecord.field_735_raw ? originalRecord.field_735_raw : '',
        text3: searchBySubject.field_1827 || '',
        numbers1__1: recordNonSRA.length,
        numbers12: 100,
        numbers18: skipped.numberOfSessions,
        numbers8: skipped.skippedLessons,
      };
      if (searchBySubject.field_1829 === 'Yes') {
        columnValues['status'] = 'Completed';
      }
      const updateMonday = await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, columnValues);
      let isError = false;
      if (updateMonday?.error_message?.includes("This column ID doesn't exist for the board") && updateMonday?.error_message?.includes('numbers1__1')) {
        const updateMondayError = await BlabMondayService.ChangeMultipleColumnValues(subitem.board.id, subitem.id, columnValues);
        Logger.log(`Reading Curriculum Subitem Updated to Active on Monday with Error: ${JSON.stringify(updateMondayError)}`);
        isError = true;
      }

      await BlabMondayService.CreateUpdate(
        subitem.id,
        `<b>${recordNonSRA[0]?.field_762}} has been completed</b>

            Date of Completion: <b>${moment(searchBySubject.field_727_raw.date).format('YYYY-MM-DD')}</b>

            Rep 1 Score: ${numbers4}
            Rep 2 Score: ${numbers1}
            Rep 3 Score: ${repNumber === 'numbers9' ? searchBySubject.field_735_raw : numbers9}
            Rep 4 Score: ${repNumber === 'dup__of_rep_3' ? searchBySubject.field_735_raw : numbers9}
            Rep 5 Score: ${repNumber === 'dup__of_rep_4' ? searchBySubject.field_735_raw : numbers9}
            `,
      );
      await knackService.updateRecord('object_50', searchBySubject.id, { field_1488: isError ? 'Normal Lesson Update' : 'Completed Lesson Update' });
    }
  }
}

function getColumnValuesById(source, id, getValueType = 0) {
  const rs = source?.column_values?.filter((s) => s.id === id)?.[0];
  return (getValueType === 0 ? rs?.text || null : getValueType === 1 ? rs?.value || null : getValueType === 2 ? rs?.display_value || null : null) || null;
}
