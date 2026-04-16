import ProgressChartService from '../../services/other-business/progress-chart.service';

export async function progressChart(req, res, next) {
  const { challenge, event } = req.body;
  try {
    if (challenge) return res.status(200).send({ challenge });
    if (event) {
      ProgressChartService.run(event);
    }
    return res.status(200).send(req.body);
  } catch (error) {
    next(error);
  }
}
