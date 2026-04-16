import ESService from '../../services/employee-staff/es.service';

export async function ES19StaffScheduleGenerateSchedule(req, res, next) {
  const { challenge, event } = req.body;
  try {
    if (challenge) return res.status(200).send({ challenge });

    await ESService.ES19GenerateSchedule(event);
    return res.status(200).send(req.body);
  } catch (error) {
    next(error);
  }
}

export async function ES18StaffScheduleExportGS(req, res, next) {
  const { challenge, event } = req.body;
  try {
    if (challenge) return res.status(200).send({ challenge });

    await ESService.ES18StaffScheduleExportGS(event);
    return res.status(200).send(req.body);
  } catch (error) {
    next(error);
  }
}
