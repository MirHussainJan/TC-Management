export const Constants = {
  apiURL: 'https://api.monday.com/v2',
  Approved: 'Approved',
  FullDay: 'Full day',
  PartialDay: 'Partial day',
  LeaveEarlier: 'Leave Earlier',
  StartLater: 'Start Later',
  MiddleDay: 'Time off Middle of the Day',
  SideWork: 'SIDE WORK',
  NotAvailable: 'Not available',
  Success: 'Success',
  Done: 'Done',
  Error: 'Error',
  ActiveEmployee: 'Active Employee',
  Passed: 'Passed',
  Certified: 'Certified',
  CheckFDRefunded: 'Check FD Refunded',
  FortyHours: '40 hours',
  TwentyHours: '20 hours',
  TenHours: '10 hours',
  FifthHours: '5 hours',
  NoHoursLeft: 'No Hours Left',
  HourNotEnough: 'NOT enough for week',
  Clear: 'Clear',
  Active: 'Active',
  Inactive: 'Inactive',
  Admin: 'Admin',
  MissingFamilyGDriveFolder: 'Missing Family G-Drive Folder',
  MissingStudentGDriveFolder: 'Missing Student G-Drive Folder',
  ProgressChartTemplateFileId: '10VdXF2paQoUi1HKslIuCSNZYigGqlq7QSi0l8uS9xRM',
  ES18ExportGSTemplateFileId: '15afJHlnWboAAxI7s2A_erEsNT_wwE4S4Bv-uy3VfR2M',
  ES18ExportGSFolder: '1BYjvh4z8s2wHfdUTafVbTc9z6wKWKkqv',
  SheetNameBlank: 'Blank',
  SheetNameTemplate: 'Template',
  Completed: 'Completed',
  AddedToSHL: 'Added to SHL & Ready to push 7 days',
  CourseCompleted: 'Course Completed',
};

export const BoardConstants = {
  ETOR: 3603601005,
  WS: 3588318799,
  MondayAppLog: 5097331288,
  ED: 3181670486,
  TSQ: 3268983353,
  TAM: 3598131151,
  MS: 3639959131,
  SD: 3288941979,
  SHL: 3617141983,
  FD: 3183366173,
  SHLArchive: 5562294065,
  Calendars: 3545585011,
  SHLManagement: 6697140994,
  LeadPipeline: 3194340850,
  SubLeadPipeline: 3571998401,
  SessionFeedbackLog: 4911698347,
  BinderAnalyticsData: 5714515483,
  SubSetScheduleForStaff: 4160435873,
  StaffSchedule: 4835575212,
};

export const BoardList = [
  { boardName: 'Employee Time Off Log (ETOR)', boardId: 3603601005 },
  { boardName: 'Weekly Scheduling', boardId: 3588318799 },
  { boardName: 'Service App Log', boardId: 5097331288 },
  { boardName: 'Employee Directory', boardId: 3181670486 },
  { boardName: 'Tutor Subject Qualifications', boardId: 3268983353 },
  { boardName: 'Tutors Availability Master', boardId: 3598131151 },
  { boardName: 'Master Schedule', boardId: 3639959131 },
  { boardName: 'Student Hours Log', boardId: 3617141983 },
  { boardName: 'Student Database', boardId: 3288941979 },
  { boardName: 'Family Database', boardId: 3183366173 },
  { boardName: 'Calendars', boardId: 3545585011 },
  { boardName: 'Staff Schedule', boardId: 4835575212 },
];

export const ROUTES = {};

export const DatabaseConst = {
  mysql: 'mysql',
  webhooks: 'WebHooks',
  monday_app_event: 'monday_app_event',
  monday_app_log: 'monday_app_log',
  monday_account_token: 'monday_account_token',
  monday_board_app_log: 'monday_board_app_log',
};

export const EventName = {
  NewWSTutorOff: 'New Session WS: Update Tutor Off',
  TutorCount: 'TAM: Refresh Tutor Count',
  DeductHours: 'SHL: Deduct Hours to FD and SD',
  AuditedRemainingHour: 'SHL: Audited Remaining Hour',
  SDNextSession: 'SD: Next Session',
  GenerateAccountToken: 'FD: Generate Account Token',
  MWSMSToWS: 'MWS34: MS to WS',
  AddFromWS: 'SHL1: Student Hours Log add from WS',
  AddFamilySHL: 'SHL: Add to Family SHL',
  ES19GenerateSchedule: 'ES19: Staff Schedule - Generate Schedule',
  ES18StaffScheduleExportGS: 'ES18: Staff Schedule - Export to Google Sheet',
  TCC10SMSClicksendSend: 'TCC10: SMS ClickSend TC Communication Send',
  PR: 'Progress Chart',
};

export const CenterConst = {
  JC: 'Julington Creek',
  CR210: 'CR210',
};
export const WorkspacesConst = {
  Binder: 2683266,
};

export const StudentBinderConst = {
  Group: {
    BeginningReader: 'Beginning Reader',
    Fluency: 'Fluency',
    UFLI: 'UFLI',
    WordAttack: 'Word Attack',
    Reading: 'Reading',
    MathFacts: 'Math Facts',
    Math: 'Math',
    Writing: 'Writing',
    WorkLog: 'Work Log',
  },
};

export const ReadingSubitemNameConst = [
  'Vocabulary Skills | SRA',
  'Vocabulary Skills | UC',
  'Vocabulary Skills | MMM',
  'Vocabulary Skills | RWR',
  'Vocabulary Skills | VW',
  'Vocabulary Skills | VD Drills',
  'Enrichment Skills | SOV',
  'Vocabulary Skills | RAW',
  'Comprehension Skills | SRA',
  'Comprehension Skills | FD',
  'Comprehension Skills | GMI',
  'Comprehension Skills | DS',
  'Comprehension Skills | GF',
  'Comprehension Skills | DC',
  'Comprehension Skills | II',
];