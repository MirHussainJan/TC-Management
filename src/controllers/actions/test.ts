import ConstColumn            from '../../constants/constant-column';
import BlabMondayService      from '../../services/blab-monday.service';
import CronService            from '../../services/cron.service';
import SDNextSessionService   from '../../services/student-database/sd-next-session.service';
import StudentDatabaseService from '../../services/student-database/student-database.service';

export async function updateMultiple() {
  const abc          = 1;
  const xyz          = 4;
  const columnValues = { numbers54: Number(abc), numbers35: Number(xyz) };
  BlabMondayService.ChangeMultipleColumnValues(3183366173, 4488848292, columnValues);
}

export async function preRunSDNextSession(req, res) {
  const isHoliday = await SDNextSessionService.PreRun();
  return res.status(200).send({ 'Holiday': isHoliday });
}

export async function runSDNextSession(req, res) {
  StudentDatabaseService.NextSession();
  return res.status(200).send();
}

export async function boardAppLog() {
  CronService.checkBoardAppLog();
}
