import express from 'express';
const router = express.Router();
import logger from '../helper/logger';
import appRoutes from './app-routes';

router.use(appRoutes);
router.get('/', function (req, res) {
  res.json(getHealth());
});

router.get('/health', function (req, res) {
  res.json(getHealth());
  res.end();
});

router.get('/monday-app-association.json', function (req, res) {
  res.json({
    apps: [{ clientID: process.env.MONDAY_CLIENT_ID }],
  });
  res.end();
});

router.get('/test-logger', function (req, res) {
  logger.log(`logger ${new Date()}`);
  res.end();
});

function getHealth() {
  return {
    ok: true,
    message: 'Healthy TC!!!',
  };
}

export default router;
