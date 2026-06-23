import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import Logger from '../helper/logger';
import * as SessionFeedbackService from './curriculum/session-feedback-binder-analytic-log-to-monday.service';

const RETRY_DELAY_MS = Number(process.env.SESSION_FEEDBACK_RETRY_DELAY_MS || 60000);
const queueDirectory = path.resolve(process.env.SESSION_FEEDBACK_QUEUE_DIR || path.join(process.cwd(), 'data', 'session-feedback-pending'));

export default class SessionFeedbackDurableQueueService {
  private static drainPromise: Promise<void> | null = null;
  private static retryTimer: NodeJS.Timeout | null = null;

  static async enqueue(bodyData: any): Promise<string> {
    if (!bodyData?.id) {
      throw new Error('Session feedback payload requires an id');
    }

    await fs.mkdir(queueDirectory, { recursive: true });

    const serialized = JSON.stringify({
      jobId: randomUUID(),
      bodyData,
      createdAt: new Date().toISOString(),
    });
    const hash = createHash('sha256').update(JSON.stringify(bodyData)).digest('hex').slice(0, 16);
    const safeRecordId = String(bodyData.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeRecordId}-${hash}.json`;
    const finalPath = path.join(queueDirectory, fileName);
    const temporaryPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;

    try {
      await fs.access(finalPath);
    } catch {
      await fs.writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporaryPath, finalPath);
    }

    this.start();
    return fileName.replace(/\.json$/, '');
  }

  static start() {
    if (!this.drainPromise) {
      this.drainPromise = this.drain().finally(() => {
        this.drainPromise = null;
      });
    }
  }

  static async getStatus() {
    await fs.mkdir(queueDirectory, { recursive: true });
    const pending = (await fs.readdir(queueDirectory)).filter((name) => name.endsWith('.json')).length;

    return {
      pending,
      processing: Boolean(this.drainPromise),
    };
  }

  private static async drain() {
    await fs.mkdir(queueDirectory, { recursive: true });
    const fileNames = (await fs.readdir(queueDirectory)).filter((name) => name.endsWith('.json')).sort();

    for (const fileName of fileNames) {
      const filePath = path.join(queueDirectory, fileName);

      try {
        const job = JSON.parse(await fs.readFile(filePath, 'utf8'));
        const result = await SessionFeedbackService.sessionFeedbackBinderAnalyticLogToMonday(job.bodyData);

        if (!result || result.status >= 500) {
          throw new Error(String(result?.message || 'Session feedback processing failed'));
        }

        await fs.unlink(filePath);
        Logger.log(`Session feedback durable queue completed job ${job.jobId || fileName}`);
      } catch (error) {
        Logger.log(`Session feedback durable queue retained failed job ${fileName}: ${error}`);
        this.scheduleRetry();
      }
    }
  }

  private static scheduleRetry() {
    if (this.retryTimer) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.start();
    }, RETRY_DELAY_MS);
    this.retryTimer.unref();
  }
}
