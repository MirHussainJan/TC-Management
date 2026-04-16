import logger                  from '../../helper/logger';
import * as ActStudentDatabase from '../actions/act-student-database';

//When item created Student Hours Log
export async function NextSession(req, res) {
  try {
    const { status, message } = await ActStudentDatabase.NextSession();
    return res.status(status).send({ message });
  } catch (e) {
    logger.log(`There was an unexpected system error [NextSession]: ${e}`);
    return res.status(500).send({ message: 'Internal server error' });
  }
}
