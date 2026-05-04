import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import knackService from '../services/knack.service';
import BlabMondayService from '../services/blab-monday.service';
import { BoardConstants } from '../constants/constant';
import ConstColumn from '../constants/constant-column';

dotenv.config();

type Options = {
  csv: string;
  applyKnack: boolean;
  applyMonday: boolean;
  progressEvery: number;
  outCsv?: string;
};

type InputRow = {
  recordId: string;
  mondayItemId: string;
  studentId: string;
};

type KnackRecord = {
  id: string;
  field_1080_raw?: string;
  field_1022_raw?: { date?: string };
  field_245?: any;
  field_245_raw?: any;
  field_242?: any;
  field_242_raw?: any;
  field_1016?: any;
  field_1016_raw?: any;
};

type AuditRow = {
  studentId: string;
  recordId: string;
  date: string;
  mondayItemId: string;
  knackEarned: number;
  knackSpent: number;
  knackTotalBefore: number;
  knackTotalAfter: number;
  mondayEarnedBefore: number;
  mondaySpentBefore: number;
  mondayTotalBefore: number;
  mondayEarnedAfter: number;
  mondaySpentAfter: number;
  mondayTotalAfter: number;
  knackStatus: string;
  mondayStatus: string;
  error: string;
};

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    csv: './logs/token-repair-dryrun-all.csv',
    applyKnack: false,
    applyMonday: false,
    progressEvery: 100,
  };

  for (const arg of argv) {
    if (arg === '--apply-knack') opts.applyKnack = true;
    else if (arg === '--apply-monday') opts.applyMonday = true;
    else if (arg.startsWith('--csv=')) opts.csv = arg.split('=')[1] || opts.csv;
    else if (arg.startsWith('--out-csv=')) opts.outCsv = arg.split('=')[1] || undefined;
    else if (arg.startsWith('--progress-every=')) {
      const v = Number(arg.split('=')[1]);
      if (Number.isFinite(v) && v > 0) opts.progressEvery = Math.floor(v);
    }
  }

  return opts;
}

function parseNumberSafe(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value.replaceAll(',', '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return parseNumberSafe(value.text);
    if (typeof value.value === 'string' || typeof value.value === 'number') return parseNumberSafe(value.value);
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

function readInput(csvPath: string): InputRow[] {
  const content = fs.readFileSync(path.resolve(process.cwd(), csvPath), 'utf8').trim();
  const lines = content.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const idx = {
    recordId: headers.indexOf('recordId'),
    mondayItemId: headers.indexOf('mondayItemId'),
    studentId: headers.indexOf('studentId'),
    status: headers.indexOf('status'),
  };

  const rows: InputRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const status = (cols[idx.status] || '').trim();
    if (status && status !== 'mismatch') continue;
    rows.push({
      recordId: (cols[idx.recordId] || '').trim(),
      mondayItemId: (cols[idx.mondayItemId] || '').trim(),
      studentId: (cols[idx.studentId] || '').trim(),
    });
  }
  return rows.filter((r) => r.recordId && r.mondayItemId && r.studentId);
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

function csvEscape(v: any): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function writeAudit(filePath: string, rows: AuditRow[]) {
  const headers = [
    'studentId','recordId','date','mondayItemId','knackEarned','knackSpent','knackTotalBefore','knackTotalAfter',
    'mondayEarnedBefore','mondaySpentBefore','mondayTotalBefore','mondayEarnedAfter','mondaySpentAfter','mondayTotalAfter','knackStatus','mondayStatus','error'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.studentId,r.recordId,r.date,r.mondayItemId,r.knackEarned,r.knackSpent,r.knackTotalBefore,r.knackTotalAfter,
      r.mondayEarnedBefore,r.mondaySpentBefore,r.mondayTotalBefore,r.mondayEarnedAfter,r.mondaySpentAfter,r.mondayTotalAfter,r.knackStatus,r.mondayStatus,r.error
    ].map(csvEscape).join(','));
  }
  const resolved = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, lines.join('\n') + '\n', 'utf8');
  return resolved;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!process.env.KNACK_APP_ID || !process.env.KNACK_API_KEY) throw new Error('Missing KNACK_APP_ID or KNACK_API_KEY');
  if (!process.env.MONDAY_ACCESS_TOKEN && process.env.API_TOKEN) process.env.MONDAY_ACCESS_TOKEN = process.env.API_TOKEN;
  if (!process.env.MONDAY_ACCESS_TOKEN) throw new Error('Missing MONDAY_ACCESS_TOKEN');

  const rows = readInput(opts.csv);
  const studentSet = new Set(rows.map((r) => r.studentId));
  console.log(`Loaded mismatch rows=${rows.length}`);
  console.log(`Unique students=${studentSet.size}`);

  const keyByRecordId = new Map(rows.map((r) => [r.recordId, r]));
  const audit: AuditRow[] = [];

  let processed = 0;
  let knackUpdated = 0;
  let mondayUpdated = 0;
  let errors = 0;

  for (const studentId of studentSet) {
    const resp = await knackService.getRecords('object_29', {
      rows_per_page: 1000,
      filters: { match: 'and', rules: [{ field: 'field_1080', operator: 'is', value: studentId }] },
    });

    const allRecords: KnackRecord[] = (resp?.records || []).map((r: any) => r as KnackRecord);

    allRecords.sort((a, b) => {
      const ad = moment(a.field_1022_raw?.date || '', 'MM/DD/YYYY', true);
      const bd = moment(b.field_1022_raw?.date || '', 'MM/DD/YYYY', true);
      if (ad.isValid() && bd.isValid()) {
        if (ad.isBefore(bd, 'day')) return -1;
        if (ad.isAfter(bd, 'day')) return 1;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    let running = parseNumberSafe(allRecords[0]?.field_1016 ?? allRecords[0]?.field_1016_raw);

    for (let i = 0; i < allRecords.length; i++) {
      const rec = allRecords[i];
      const earned = Math.max(0, parseNumberSafe(rec.field_245 ?? rec.field_245_raw));
      const spent = Math.max(0, parseNumberSafe(rec.field_242 ?? rec.field_242_raw));
      const beforeTotal = Math.max(0, parseNumberSafe(rec.field_1016 ?? rec.field_1016_raw));

      if (i > 0) running = Math.max(0, running - spent + earned);
      const afterTotal = running;

      const inputRow = keyByRecordId.get(String(rec.id));
      if (!inputRow) continue;

      const mondayItemId = Number(inputRow.mondayItemId);
      let mondayEarnedBefore = 0;
      let mondaySpentBefore = 0;
      let mondayTotalBefore = 0;
      let mondayStatus = 'skipped';
      let knackStatus = 'noop';
      let err = '';

      try {
        if (opts.applyKnack && beforeTotal !== afterTotal) {
          await knackService.updateRecord('object_29', String(rec.id), { field_1016: afterTotal });
          knackStatus = 'updated';
          knackUpdated++;
        } else if (beforeTotal !== afterTotal) {
          knackStatus = 'would-update';
        }

        const item = await BlabMondayService.GetItemById(
          mondayItemId,
          [ConstColumn.SessionFeedbackLog.TokensEarned, ConstColumn.SessionFeedbackLog.TokensSpent, ConstColumn.SessionFeedbackLog.TokenTotal],
          false,
          false,
          false,
        );

        mondayEarnedBefore = parseItemColumnNumber(item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokensEarned));
        mondaySpentBefore = parseItemColumnNumber(item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokensSpent));
        mondayTotalBefore = parseItemColumnNumber(item?.column_values?.find((c) => c.id === ConstColumn.SessionFeedbackLog.TokenTotal));

        const mondayNeeds = mondayEarnedBefore !== earned || mondaySpentBefore !== spent || mondayTotalBefore !== afterTotal;
        if (opts.applyMonday && mondayNeeds) {
          await BlabMondayService.ChangeMultipleColumnValues(BoardConstants.SessionFeedbackLog, mondayItemId, {
            [ConstColumn.SessionFeedbackLog.TokensEarned]: earned,
            [ConstColumn.SessionFeedbackLog.TokensSpent]: spent,
            [ConstColumn.SessionFeedbackLog.TokenTotal]: afterTotal,
          });
          mondayStatus = 'updated';
          mondayUpdated++;
        } else if (mondayNeeds) {
          mondayStatus = 'would-update';
        } else {
          mondayStatus = 'noop';
        }
      } catch (e: any) {
        errors++;
        err = e?.message || String(e);
        if (knackStatus === 'noop') knackStatus = 'error';
        if (mondayStatus === 'skipped') mondayStatus = 'error';
      }

      audit.push({
        studentId,
        recordId: String(rec.id),
        date: String(rec.field_1022_raw?.date || ''),
        mondayItemId: String(mondayItemId),
        knackEarned: earned,
        knackSpent: spent,
        knackTotalBefore: beforeTotal,
        knackTotalAfter: afterTotal,
        mondayEarnedBefore,
        mondaySpentBefore,
        mondayTotalBefore,
        mondayEarnedAfter: earned,
        mondaySpentAfter: spent,
        mondayTotalAfter: afterTotal,
        knackStatus,
        mondayStatus,
        error: err,
      });

      processed++;
      if (opts.progressEvery > 0 && processed % opts.progressEvery === 0) {
        console.log(`PROGRESS processed=${processed} knackUpdated=${knackUpdated} mondayUpdated=${mondayUpdated} errors=${errors}`);
      }
    }
  }

  const out = writeAudit(opts.outCsv || './logs/token-repair-running-balance-audit.csv', audit);
  console.log(`AUDIT_WRITTEN path=${out} rows=${audit.length}`);
  console.log(JSON.stringify({
    processed,
    uniqueStudents: studentSet.size,
    knackUpdated,
    mondayUpdated,
    errors,
    mode: { applyKnack: opts.applyKnack, applyMonday: opts.applyMonday },
    outCsv: out,
  }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
