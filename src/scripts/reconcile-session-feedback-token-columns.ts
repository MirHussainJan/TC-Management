import dotenv from 'dotenv';
import moment from 'moment';
import * as fs from 'fs';
import * as path from 'path';
import { BoardConstants } from '../constants/constant';
import ConstColumn from '../constants/constant-column';
import BlabMondayService from '../services/blab-monday.service';
import knackService from '../services/knack.service';

dotenv.config();

type CliOptions = {
  apply: boolean;
  limit: number;
  rowsPerPage: number;
  progressEvery: number;
  from?: string;
  to?: string;
  studentId?: string;
  csv?: string;
  recordIds: Set<string>;
};

type CsvMismatchRow = {
  recordId: string;
  mondayItemId: string;
  studentId: string;
  date: string;
  currentEarned: number;
  currentSpent: number;
  currentTotal: number;
  desiredEarned: number;
  desiredSpent: number;
  desiredTotal: number;
  action: string;
  status: string;
  error: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    limit: Number.MAX_SAFE_INTEGER,
    rowsPerPage: 200,
    progressEvery: 100,
    recordIds: new Set<string>(),
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value);
      }
      continue;
    }

    if (arg.startsWith('--rows-per-page=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.rowsPerPage = Math.floor(value);
      }
      continue;
    }

    if (arg.startsWith('--progress-every=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.progressEvery = Math.floor(value);
      }
      continue;
    }

    if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--student-id=')) {
      options.studentId = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--csv=')) {
      const value = arg.split('=')[1]?.trim();
      if (value) {
        options.csv = value;
      }
      continue;
    }

    if (arg.startsWith('--record-id=')) {
      const value = arg.split('=')[1]?.trim();
      if (value) {
        options.recordIds.add(value);
      }
      continue;
    }

    if (arg.startsWith('--record-ids=')) {
      const value = arg.split('=')[1] || '';
      value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .forEach((id) => options.recordIds.add(id));
      continue;
    }
  }

  return options;
}

function parseNumberSafe(value: any): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const cleaned = value.split(',').join('').trim();
    if (!cleaned.length) {
      return 0;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return parseNumberSafe(value.text);
    }

    if (typeof value.value === 'number' || typeof value.value === 'string') {
      return parseNumberSafe(value.value);
    }
  }

  return 0;
}

function extractSafeTokenValues(record: any) {
  const tokensEarned = Math.max(0, parseNumberSafe(record?.field_245 ?? record?.field_245_raw));
  const tokensSpent = Math.max(0, parseNumberSafe(record?.field_242 ?? record?.field_242_raw));
  const rawTokenTotal = parseNumberSafe(record?.field_1016 ?? record?.field_1016_raw);
  const derivedTokenTotal = tokensEarned - tokensSpent;
  const tokenTotal = Math.max(0, rawTokenTotal >= 0 ? rawTokenTotal : derivedTokenTotal);

  return {
    tokensEarned,
    tokensSpent,
    tokenTotal,
  };
}

function parseItemColumnNumber(column: any): number {
  if (!column) {
    return 0;
  }

  if (typeof column.text === 'string' && column.text.length > 0) {
    return parseNumberSafe(column.text);
  }

  if (typeof column.value === 'string' && column.value.length > 0) {
    try {
      const parsed = JSON.parse(column.value);
      if (typeof parsed === 'number') {
        return parseNumberSafe(parsed);
      }

      if (parsed && typeof parsed === 'object') {
        return parseNumberSafe(parsed.value);
      }
    } catch {
      return parseNumberSafe(column.value);
    }
  }

  return 0;
}

function isValidDateInput(value?: string): boolean {
  if (!value) {
    return true;
  }

  return moment(value, 'YYYY-MM-DD', true).isValid();
}

function isRecordInDateRange(record: any, from?: string, to?: string): boolean {
  if (!from && !to) {
    return true;
  }

  const dateRaw = record?.field_1022_raw?.date;
  const recordDate = moment(dateRaw, 'MM/DD/YYYY', true);
  if (!recordDate.isValid()) {
    return false;
  }

  if (from) {
    const fromDate = moment(from, 'YYYY-MM-DD', true);
    if (recordDate.isBefore(fromDate, 'day')) {
      return false;
    }
  }

  if (to) {
    const toDate = moment(to, 'YYYY-MM-DD', true);
    if (recordDate.isAfter(toDate, 'day')) {
      return false;
    }
  }

  return true;
}

function getMondayItemId(record: any): string {
  const value = String(record?.field_1710 ?? '').trim();
  return /^\d+$/.test(value) ? value : '';
}

function csvEscape(value: string | number): string {
  const raw = String(value ?? '');
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function writeCsv(filePathInput: string, rows: CsvMismatchRow[]) {
  const headers = [
    'recordId',
    'mondayItemId',
    'studentId',
    'date',
    'currentEarned',
    'currentSpent',
    'currentTotal',
    'desiredEarned',
    'desiredSpent',
    'desiredTotal',
    'action',
    'status',
    'error',
  ];

  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(
      [
        row.recordId,
        row.mondayItemId,
        row.studentId,
        row.date,
        row.currentEarned,
        row.currentSpent,
        row.currentTotal,
        row.desiredEarned,
        row.desiredSpent,
        row.desiredTotal,
        row.action,
        row.status,
        row.error,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  const resolved = path.resolve(process.cwd(), filePathInput);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, csvLines.join('\n') + '\n', 'utf8');
  return resolved;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!isValidDateInput(options.from) || !isValidDateInput(options.to)) {
    throw new Error('Invalid --from or --to date format. Use YYYY-MM-DD.');
  }

  if (!process.env.KNACK_APP_ID || !process.env.KNACK_API_KEY) {
    throw new Error('Missing KNACK_APP_ID or KNACK_API_KEY in environment.');
  }

  // AppBaseService uses MONDAY_ACCESS_TOKEN, but keep API_TOKEN as fallback for older setups.
  if (!process.env.MONDAY_ACCESS_TOKEN && process.env.API_TOKEN) {
    process.env.MONDAY_ACCESS_TOKEN = process.env.API_TOKEN;
  }

  if (!process.env.MONDAY_ACCESS_TOKEN) {
    throw new Error('Missing MONDAY_ACCESS_TOKEN for Monday API in environment.');
  }

  console.log('Starting session feedback token reconciliation');
  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        from: options.from || null,
        to: options.to || null,
        studentId: options.studentId || null,
        limit: options.limit === Number.MAX_SAFE_INTEGER ? null : options.limit,
        rowsPerPage: options.rowsPerPage,
        progressEvery: options.progressEvery,
        recordIdsCount: options.recordIds.size,
      },
      null,
      2,
    ),
  );

  let scannedRecords = 0;
  let selectedRecords = 0;
  let comparedCount = 0;
  let mismatchCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const csvRows: CsvMismatchRow[] = [];

  let page = 1;
  let hasMore = true;

  while (hasMore && selectedRecords < options.limit) {
    const response = await knackService.getRecords('object_29', {
      page,
      rows_per_page: options.rowsPerPage,
    });
    const pageRecords = response?.records || [];
    if (!pageRecords.length) {
      break;
    }

    scannedRecords += pageRecords.length;

    for (const record of pageRecords) {
      if (selectedRecords >= options.limit) {
        hasMore = false;
        break;
      }

      const mondayItemIdFromRecord = getMondayItemId(record);
      if (!mondayItemIdFromRecord) {
        continue;
      }

      if (options.recordIds.size > 0 && !options.recordIds.has(String(record.id))) {
        continue;
      }

      if (options.studentId) {
        const studentIdFromRecord = String(record?.field_1080_raw ?? record?.field_1080 ?? '').trim();
        if (studentIdFromRecord !== options.studentId) {
          continue;
        }
      }

      if (!isRecordInDateRange(record, options.from, options.to)) {
        continue;
      }

      selectedRecords++;

    const recordId = String(record.id);
    const mondayItemId = Number(mondayItemIdFromRecord);

    try {
      const desired = extractSafeTokenValues(record);
      const studentId = String(record?.field_1080_raw ?? record?.field_1080 ?? '');
      const date = String(record?.field_1022_raw?.date ?? '');

      const item = await BlabMondayService.GetItemById(
        mondayItemId,
        [ConstColumn.SessionFeedbackLog.TokensEarned, ConstColumn.SessionFeedbackLog.TokensSpent, ConstColumn.SessionFeedbackLog.TokenTotal],
        false,
        false,
        false,
      );

      if (!item?.id) {
        errorCount++;
        console.log(`SKIP record=${recordId} mondayItem=${mondayItemId} reason=item-not-found`);
        continue;
      }

      const currentEarned = parseItemColumnNumber(
        item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokensEarned),
      );
      const currentSpent = parseItemColumnNumber(
        item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokensSpent),
      );
      const currentTotal = parseItemColumnNumber(
        item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokenTotal),
      );

      comparedCount++;

      const hasMismatch =
        currentEarned !== desired.tokensEarned || currentSpent !== desired.tokensSpent || currentTotal !== desired.tokenTotal;

      if (!hasMismatch) {
        continue;
      }

      mismatchCount++;
      console.log(
        `MISMATCH record=${recordId} mondayItem=${mondayItemId} current={earned:${currentEarned},spent:${currentSpent},total:${currentTotal}} desired={earned:${desired.tokensEarned},spent:${desired.tokensSpent},total:${desired.tokenTotal}}`,
      );

      const row: CsvMismatchRow = {
        recordId,
        mondayItemId: String(mondayItemId),
        studentId,
        date,
        currentEarned,
        currentSpent,
        currentTotal,
        desiredEarned: desired.tokensEarned,
        desiredSpent: desired.tokensSpent,
        desiredTotal: desired.tokenTotal,
        action: options.apply ? 'update' : 'dry-run',
        status: 'mismatch',
        error: '',
      };

      if (options.apply) {
        await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SessionFeedbackLog, mondayItemId, {
          [ConstColumn.SessionFeedbackLog.TokensEarned]: desired.tokensEarned,
          [ConstColumn.SessionFeedbackLog.TokensSpent]: desired.tokensSpent,
          [ConstColumn.SessionFeedbackLog.TokenTotal]: desired.tokenTotal,
        });

        updatedCount++;
        row.status = 'updated';
        console.log(`UPDATED record=${recordId} mondayItem=${mondayItemId}`);
      }

      csvRows.push(row);
    } catch (error: any) {
      errorCount++;
      csvRows.push({
        recordId,
        mondayItemId: String(mondayItemId),
        studentId: String(record?.field_1080_raw ?? record?.field_1080 ?? ''),
        date: String(record?.field_1022_raw?.date ?? ''),
        currentEarned: 0,
        currentSpent: 0,
        currentTotal: 0,
        desiredEarned: 0,
        desiredSpent: 0,
        desiredTotal: 0,
        action: options.apply ? 'update' : 'dry-run',
        status: 'error',
        error: error?.message || String(error),
      });
      console.log(`ERROR record=${recordId} mondayItem=${mondayItemId} reason=${error?.message || String(error)}`);
    }

      if (options.progressEvery > 0 && selectedRecords % options.progressEvery === 0) {
        console.log(
          `PROGRESS scanned=${scannedRecords} selected=${selectedRecords} compared=${comparedCount} mismatch=${mismatchCount} updated=${updatedCount} errors=${errorCount}`,
        );
      }
    }

    const currentPage = Number(response?.current_page || page);
    const totalPages = Number(response?.total_pages || currentPage);
    hasMore = currentPage < totalPages;
    page = currentPage + 1;
  }

  let csvPath = '';
  if (options.csv) {
    csvPath = writeCsv(options.csv, csvRows);
    console.log(`CSV_WRITTEN path=${csvPath} rows=${csvRows.length}`);
  }

  console.log(
    JSON.stringify(
      {
        scannedRecords,
        selectedRecords,
        comparedCount,
        mismatchCount,
        updatedCount,
        errorCount,
        mode: options.apply ? 'apply' : 'dry-run',
        csvPath: csvPath || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
