import ConstColumn from '../../constants/constant-column';
import Logger from '../../helper/logger';
import knackService from '../knack.service';
import LogService from '../log-service';

export async function deleteLessonWritingPreTestDeleted(bodyData) {
  let status = 200;
  let message = 'Lesson writing pre-test deleted successfully';
  // const deleteRecordeds = bodyData.deleteRecorded;
  let logData = {
    board_id: 0,
    item_id: 0,
    item_name: bodyData?.id,
    board_name: '',
    event_name: 'Delete Lesson Writing Pre-Test',
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
      Logger.log(`StartLog failed in deleteLessonWritingPreTestDeleted: ${logError}`);
    }

    result = { msg: `deleteLessonWritingPreTestDeleted executed` };
    // for (const record of deleteRecordeds) {
    const searchRecords = await knackService.getRecords('object_1', {
      filters: { match: 'and', rules: [{ field: ConstColumn.Knack.Students.RecordId, operator: 'is', value: bodyData.fields?.field_1315 }] },
    });
    if (bodyData.fields?.field_1047 == 'Pre-Test' && searchRecords?.records?.length > 0) {
      result = { msg: `Found student records for Record ID ${bodyData.fields?.field_1315}` };
      for (const studentRecord of searchRecords.records) {
        result = { msg: `Processing student record ID ${studentRecord.id}` };
        if (studentRecord.field_1796 !== 'Yes' && studentRecord.field_1643 !== 'Yes') {
          result = { msg: `Deleting writing pre-test for student record ID ${studentRecord.field_17}` };

          //Delete Records Writing Curriculumn
          const deleteRecords = await knackService.getRecords('object_46', {
            filters: {
              match: 'and',
              rules: [
                { field: ConstColumn.Knack.WritingCurriculumn.WritingComponent, operator: 'is', value: bodyData.fields?.field_1045 },
                { field: ConstColumn.Knack.WritingCurriculumn.LevelNumberFormat, operator: 'is', value: bodyData.fields?.field_1622 },
                { field: ConstColumn.Knack.WritingCurriculumn.StudentKnackID, operator: 'is', value: bodyData.fields?.field_1315 },
              ],
            },
          });
          result = { msg: `Found ${deleteRecords.records.length} writing pre-test records to delete for student record ID ${studentRecord.field_17}` };
          for (const delRecord of deleteRecords.records) {
            await knackService.deleteRecord('object_46', delRecord.id);
            result = { msg: `Deleted writing pre-test record ID ${delRecord.id} for student record ID ${studentRecord.field_17}` };
          }

          //Create Records Writing Curriculumn

          //search Lessons Writing Curriculumn
          const lessonsWritingCurriculumn = await knackService.getRecords('object_45', {
            sort_field: ConstColumn.Knack.LessonWritingCurriculumn.ID,
            sort_order: 'asc',
            filters: {
              match: 'and',
              rules: [
                { field: ConstColumn.Knack.LessonWritingCurriculumn.WritingComponent, operator: 'is', value: bodyData.fields?.field_1045 },
                { field: ConstColumn.Knack.LessonWritingCurriculumn.Level, operator: 'is', value: bodyData.fields?.field_1044 },
                { field: ConstColumn.Knack.LessonWritingCurriculumn.LevelNumber, operator: 'is', value: bodyData.fields?.field_1622 },
                { field: ConstColumn.Knack.LessonWritingCurriculumn.Lesson, operator: 'is', value: 'Pre-Test' },
              ],
            },
          });

          const rs = await knackService.createRecord('object_46', {
            field_587: studentRecord.id, //Student
            field_589: lessonsWritingCurriculumn?.[0]?.id, //Lessons Writing Curriculumn
          });

          result.msg += `\nCreated new writing pre-test record ID ${rs.id} for student record ID ${studentRecord.field_17}`;
        }
      }
    }
    // }

    if (mondayLog) {
      await LogService.DoneLog({ dbData: mondayLog, result });
    }
    return { status, message };
  } catch (error) {
    status = 500;
    message = `Error deleting lesson writing pre-test: ${error.message}`;
    Logger.log(`Error in deleteLessonWritingPreTestDeleted: ${error}`);
    if (mondayLog) {
      await LogService.ExceptionLog({
        dbData: mondayLog,
        error,
        message: `======Delete Lesson Writing Pre-Test Exception=======`,
      });
    }
    return { status, message };
  }

  return { status, message };
}
