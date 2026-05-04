import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import knackService from '../services/knack.service';
import BlabMondayService from '../services/blab-monday.service';
import ConstColumn from '../constants/constant-column';
import { BoardConstants } from '../constants/constant';

dotenv.config();

type Options = {
  csv: string;
  applyKnack: boolean;
  applyMonday: boolean;
  outCsv: string;
  progressEvery: number;
};

type InputRow = { recordId: string; studentId: string; mondayItemId: string };

type AuditRow = {
  studentId: string;
  recordId: string;
  date: string;
  mondayItemId: string;
  earned: number;
  spent: number;
  knackPrevBefore: number;
  knackPrevAfter: number;
  knackTotalAfter: number;
  mondayTotalBefore: number;
  mondayTotalAfter: number;
  knackStatus: string;
  mondayStatus: string;
  error: string;
};

function parseArgs(argv: string[]): Options {
  const o: Options = {
    csv: './logs/token-repair-dryrun-all.csv',
    applyKnack: false,
    applyMonday: false,
    outCsv: './logs/token-running-balance-field1003-apply.csv',
    progressEvery: 100,
  };

  for (const arg of argv) {
    if (arg === '--apply-knack') o.applyKnack = true;
    else if (arg === '--apply-monday') o.applyMonday = true;
    else if (arg.startsWith('--csv=')) o.csv = arg.split('=')[1] || o.csv;
    else if (arg.startsWith('--out-csv=')) o.outCsv = arg.split('=')[1] || o.outCsv;
    else if (arg.startsWith('--progress-every=')) {
      const v = Number(arg.split('=')[1]);
      if (Number.isFinite(v) && v > 0) o.progressEvery = Math.floor(v);
    }
  }

  return o;
}

function parseNumberSafe(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replaceAll(',', '').trim();
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return parseNumberSafe(value.text);
    if (typeof value.value === 'string' || typeof value.value === 'number') return parseNumberSafe(value.value);
  }
  return 0;
}

function parseItemColumnNumber(column: any): number {
  if (!column) return 0;
  if (typeof column.text === 'string' && column.text.length > 0) return parseNumberSafe(column.text);
  if (typeof column.value === 'string' && column.value.length > 0) {
    try {
      const parsed = JSON.parse(column.value);
      if (typeof parsed === 'number') return parseNumberSafe(parsed);
      if (parsed && typeof parsed === 'object') return parseNumberSafe(parsed.value);
    } catch {
      return parseNumberSafe(column.value);
    }
  }
  return 0;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let inQuote = false;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i++;
      continue;
    }
    if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  out.push(cur);
  return out;
}

function readInputRows(csvPath: string): InputRow[] {
  const content = fs.readFileSync(path.resolve(process.cwd(), csvPath), 'utf8').trim();
  const lines = content.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const idxRecord = headers.indexOf('recordId');
  const idxStudent = headers.indexOf('studentId');
  const idxMonday = headers.indexOf('mondayItemId');
  const idxStatus = headers.indexOf('status');

  const rows: InputRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if ((cols[idxStatus] || '').trim() !== 'mismatch') continue;
    const recordId = (cols[idxRecord] || '').trim();
    const studentId = (cols[idxStudent] || '').trim();
    const mondayItemId = (cols[idxMonday] || '').trim();
    if (recordId && studentId && mondayItemId) rows.push({ recordId, studentId, mondayItemId });
  }

  return rows;
}

function csvEscape(v: any): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function writeAudit(filePath: string, rows: AuditRow[]) {
  const headers = [
    'studentId','recordId','date','mondayItemId','earned','spent','knackPrevBefore','knackPrevAfter','knackTotalAfter','mondayTotalBefore','mondayTotalAfter','knackStatus','mondayStatus','error',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.studentId,r.recordId,r.date,r.mondayItemId,r.earned,r.spent,r.knackPrevBefore,r.knackPrevAfter,r.knackTotalAfter,r.mondayTotalBefore,r.mondayTotalAfter,r.knackStatus,r.mondayStatus,r.error,
    ].map(csvEscape).join(','));
  }
  const out = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!process.env.KNACK_APP_ID || !process.env.KNACK_API_KEY) throw new Error('Missing KNACK_APP_ID or KNACK_API_KEY');
  if (!process.env.MONDAY_ACCESS_TOKEN && process.env.API_TOKEN) process.env.MONDAY_ACCESS_TOKEN = process.env.API_TOKEN;
  if (!process.env.MONDAY_ACCESS_TOKEN) throw new Error('Missing MONDAY_ACCESS_TOKEN');

  const mismatchRows = readInputRows(opts.csv);
  const studentIds = Array.from(new Set(mismatchRows.map((r) => r.studentId)));

  console.log(`Loaded mismatch rows=${mismatchRows.length}`);
  console.log(`Unique students=${studentIds.length}`);

  const mismatchByRecord = new Map(mismatchRows.map((r) => [r.recordId, r]));
  const audit: AuditRow[] = [];

  let processed = 0;
  let knackUpdated = 0;
  let mondayUpdated = 0;
  let errors = 0;

  for (const studentId of studentIds) {
    const response = await knackService.getRecords('object_29', {
      rows_per_page: 1000,
      filters: { match: 'and', rules: [{ field: 'field_1080', operator: 'is', value: studentId }] },
    });

    const records = (response?.records || []).map((r: any) => ({
      id: String(r.id),
      date: String(r?.field_1022_raw?.date || ''),
      mondayItemId: String(r?.field_1710 || '').trim(),
      earned: parseNumberSafe(r?.field_245 ?? r?.field_245_raw),
      spent: parseNumberSafe(r?.field_242 ?? r?.field_242_raw),
      total: parseNumberSafe(r?.field_1016 ?? r?.field_1016_raw),
      prev: parseNumberSafe(r?.field_1003 ?? r?.field_1003_raw),
    }));

    records.sort((a, b) => {
      const ad = moment(a.date, 'MM/DD/YYYY', true);
      const bd = moment(b.date, 'MM/DD/YYYY', true);
      if (ad.isValid() && bd.isValid()) {
        if (ad.isBefore(bd, 'day')) return -1;
        if (ad.isAfter(bd, 'day')) return 1;
      }
      return a.id.localeCompare(b.id);
    });

    if (!records.length) continue;
    let runningTotal = records[0].total;

    for (let i = 1; i < records.length; i++) {
      const rec = records[i];
      const expectedPrev = runningTotal;
      const expectedTotal = expectedPrev + rec.earned - rec.spent;
      const isPlaceholder = !rec.mondayItemId && rec.earned === 0 && rec.spent === 0;

      const inMismatchSet = mismatchByRecord.has(rec.id);
      if (!inMismatchSet) {
        runningTotal = expectedTotal;
        continue;
      }

      let knackStatus = 'noop';
      let mondayStatus = 'noop';
      let mondayTotalBefore = 0;
      let error = '';

      try {
        if (!isPlaceholder && rec.prev !== expectedPrev) {
          knackStatus = 'would-update';
          if (opts.applyKnack) {
            await knackService.updateRecord('object_29', rec.id, { field_1003: expectedPrev });
            knackStatus = 'updated';
            knackUpdated++;
          }
        }

        if (/^\d+$/.test(rec.mondayItemId)) {
          const item = await BlabMondayService.GetItemById(
            Number(rec.mondayItemId),
            [ConstColumn.SessionFeedbackLog.TokensEarned, ConstColumn.SessionFeedbackLog.TokensSpent, ConstColumn.SessionFeedbackLog.TokenTotal],
            false,
            false,
            false,
          );

          const mondayEarned = parseItemColumnNumber(item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokensEarned));
          const mondaySpent = parseItemColumnNumber(item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokensSpent));
          mondayTotalBefore = parseItemColumnNumber(item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokenTotal));

          const needsMonday = mondayEarned !== rec.earned || mondaySpent !== rec.spent || mondayTotalBefore !== expectedTotal;
          if (needsMonday) {
            mondayStatus = 'would-update';
            if (opts.applyMonday) {
              await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SessionFeedbackLog, Number(rec.mondayItemId), {
                [ConstColumn.SessionFeedbackLog.TokensEarned]: rec.earned,
                [ConstColumn.SessionFeedbackLog.TokensSpent]: rec.spent,
                [ConstColumn.SessionFeedbackLog.TokenTotal]: expectedTotal,
              });
              mondayStatus = 'updated';
              mondayUpdated++;
            }
          }
        } else {
          mondayStatus = 'no-monday-item';
        }
      } catch (e: any) {
        error = e?.message || String(e);
        errors++;
        if (knackStatus === 'noop') knackStatus = 'error';
        if (mondayStatus === 'noop') mondayStatus = 'error';
      }

      audit.push({
        studentId,
        recordId: rec.id,
        date: rec.date,
        mondayItemId: rec.mondayItemId,
        earned: rec.earned,
        spent: rec.spent,
        knackPrevBefore: rec.prev,
        knackPrevAfter: expectedPrev,
        knackTotalAfter: expectedTotal,
        mondayTotalBefore,
        mondayTotalAfter: expectedTotal,
        knackStatus,
        mondayStatus,
        error,
      });

      processed++;
      if (opts.progressEvery > 0 && processed % opts.progressEvery === 0) {
        console.log(`PROGRESS processed=${processed} knackUpdated=${knackUpdated} mondayUpdated=${mondayUpdated} errors=${errors}`);
      }

      runningTotal = expectedTotal;
    }
  }

  const outPath = writeAudit(opts.outCsv, audit);
  console.log(`AUDIT_WRITTEN path=${outPath} rows=${audit.length}`);
  console.log(JSON.stringify({ processed, knackUpdated, mondayUpdated, errors, outCsv: outPath, mode: { applyKnack: opts.applyKnack, applyMonday: opts.applyMonday } }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
