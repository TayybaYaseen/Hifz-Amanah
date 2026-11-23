// Localized import/export text (NFR-XLS-003: previews understandable in English, Urdu script, and Roman Urdu).
// Codes are canonical (packages/contracts import-export.ts); only the text here is localized. `{name}` placeholders
// take the issue's params. Western digits in every language (DEC-B38).
// TODO(F11): move into packages/i18n-keys with the other server strings; wording awaits the glossary (DEC-B39).
import type { ImportIssueCode, Locale, WorkbookRejection } from '@hifz/contracts';

type Catalogue<K extends string> = Record<K, string>;

const ISSUES: Record<Locale, Catalogue<ImportIssueCode>> = {
  en: {
    REQUIRED: '{column} is required',
    NOT_ALLOWED: 'Leave {column} empty for this section',
    NOT_PARA_QUARTERS: 'A Para amount is Rubu, Half, Salasah, or one complete Para',
    UNKNOWN_COLUMN: 'Column {column} is not part of the template and is ignored',
    INVALID_DATE: 'Use the date format YYYY-MM-DD (for example 2026-10-30)',
    FUTURE_DATE: 'The date is in the future',
    INVALID_NUMBER: 'Enter a number',
    NOT_WHOLE: 'Enter a whole number',
    OUT_OF_RANGE: 'The value must be between {min} and {max}',
    INVALID_ENUM: 'Use one of: {allowed}',
    TOO_LONG: 'At most {max} characters',
    FORMULA_NO_VALUE: 'This cell has a formula without a saved value. Type the value instead',
    DUPLICATE_KEY: 'The same {column} appears on another row of this file',
    NAME_MATCH: 'A student with this name already exists. Review it: add an ExternalStudentID to import as a new student',
    COMPOSITE_MATCH: 'A portion already exists for this student, date, section, and portion number. Review it: add an ExternalRecordID to import it',
    EXISTS_DIFFERENT: 'Already exists with different values. Choose update mode to change it',
    STUDENT_NOT_FOUND: 'Student not found in this madrasa',
    CLASS_NOT_FOUND: 'Class not found in this madrasa',
    CLASS_INACTIVE: 'This class is deactivated',
    CLASS_REQUIRED: 'A class is required to add a new student',
    NOT_YOUR_CLASS: 'Not your class',
    STATUS_CHANGE_NOT_ALLOWED: 'Only an Owner or Admin can change a student\'s status',
    CLASS_NOT_CHANGED: 'Import does not move students. The class is not changed',
    SESSION_LABEL_REQUIRED: 'Session label required',
    SESSION_LABEL_NOT_ALLOWED: 'This madrasa keeps one report per day: leave the session label empty',
    SABAQ_USES_LINES: 'Sabaq uses lines',
    UNIT_NOT_ALLOWED: 'This unit is not allowed for this section',
    SABAQ_SURAH_END: 'A Sabaq portion stays in one Surah: SurahEnd must be empty or equal SurahStart',
    PARA_MISMATCH: 'ParaNumber does not match the Surah and Ayat range',
    ABOVE_TOTAL: 'Cannot be more than TotalLines ({max})',
    ABOVE_ASSIGNED: 'Completed cannot be more than assigned',
    QUALITY_NOT_ALLOWED: 'No quality rating for Absent, Not assigned, or Pending',
    ATTENDANCE_REQUIRED: 'Mark attendance (Present, Late, or Half day) for this date first',
    NOT_ENROLLED: 'The student was not in a class on this date',
    NOT_A_CLASS_DAY: 'This date is not a class day',
    DUPLICATE_RECORD: 'A daily record already exists for this student and date',
    METADATA_UNAVAILABLE: 'Quran metadata is not loaded for this madrasa',
    RANGE_INVALID: 'The Surah and Ayat range is not valid',
    PORTION_CHANGE_NOT_ALLOWED: 'Update mode changes the result only (status, quantity, quality, mistakes, notes). The portion itself differs',
    NO_ATTEMPT: 'This portion has no result to update',
    CONFLICT_OPEN: 'This result has a sync conflict to resolve first',
    BATCH_FAILED: 'This batch could not be saved. Retry the import',
    INVALID: 'This value is not valid',
  },
  'ur-Latn': {
    REQUIRED: '{column} zaroori hai',
    NOT_ALLOWED: 'Is hisse ke liye {column} khaali chhorein',
    NOT_PARA_QUARTERS: 'Para ki miqdaar Rubu, Nisf, Salasah, ya aik mukammal Para ho',
    UNKNOWN_COLUMN: 'Column {column} template ka hissa nahin, isay chhor diya gaya',
    INVALID_DATE: 'Tareekh YYYY-MM-DD mein likhein (maslan 2026-10-30)',
    FUTURE_DATE: 'Yeh tareekh aane wali hai',
    INVALID_NUMBER: 'Number likhein',
    NOT_WHOLE: 'Poora number likhein',
    OUT_OF_RANGE: 'Qeemat {min} aur {max} ke darmiyan honi chahiye',
    INVALID_ENUM: 'In mein se aik likhein: {allowed}',
    TOO_LONG: 'Ziyada se ziyada {max} huroof',
    FORMULA_NO_VALUE: 'Is cell mein formula hai lekin mehfooz qeemat nahin. Qeemat khud likhein',
    DUPLICATE_KEY: 'Yehi {column} is file ki kisi aur line mein bhi hai',
    NAME_MATCH: 'Is naam ka talib-e-ilm pehle se maujood hai. Jaiza lein: naye talib-e-ilm ke liye ExternalStudentID likhein',
    COMPOSITE_MATCH: 'Is talib-e-ilm, tareekh, hisse aur portion number ka portion pehle se maujood hai. Jaiza lein: import ke liye ExternalRecordID likhein',
    EXISTS_DIFFERENT: 'Pehle se mukhtalif qeematon ke saath maujood hai. Badalne ke liye update mode chunein',
    STUDENT_NOT_FOUND: 'Talib-e-ilm is madrasa mein nahin mila',
    CLASS_NOT_FOUND: 'Jamaat is madrasa mein nahin mili',
    CLASS_INACTIVE: 'Yeh jamaat band hai',
    CLASS_REQUIRED: 'Naye talib-e-ilm ke liye jamaat zaroori hai',
    NOT_YOUR_CLASS: 'Aap ki jamaat nahin',
    STATUS_CHANGE_NOT_ALLOWED: 'Talib-e-ilm ka status sirf Owner ya Admin badal sakta hai',
    CLASS_NOT_CHANGED: 'Import talaba ko muntaqil nahin karta. Jamaat nahin badli',
    SESSION_LABEL_REQUIRED: 'Session label zaroori hai',
    SESSION_LABEL_NOT_ALLOWED: 'Yeh madrasa din mein aik report rakhta hai: session label khaali chhorein',
    SABAQ_USES_LINES: 'Sabaq lines mein hota hai',
    UNIT_NOT_ALLOWED: 'Is hisse ke liye yeh unit nahin',
    SABAQ_SURAH_END: 'Sabaq ka portion aik Surah mein rehta hai: SurahEnd khaali ya SurahStart ke barabar ho',
    PARA_MISMATCH: 'ParaNumber Surah aur Ayat ki range se mel nahin khata',
    ABOVE_TOTAL: 'TotalLines ({max}) se ziyada nahin ho sakta',
    ABOVE_ASSIGNED: 'Mukammal, diye gaye se ziyada nahin ho sakta',
    QUALITY_NOT_ALLOWED: 'Ghair haazir, Muqarrar nahin, ya Baqi ke liye mayaar nahin',
    ATTENDANCE_REQUIRED: 'Pehle is tareekh ki haazri (Haazir, Takheer, ya Aadha din) lagayein',
    NOT_ENROLLED: 'Is tareekh ko talib-e-ilm kisi jamaat mein nahin tha',
    NOT_A_CLASS_DAY: 'Is tareekh ko jamaat ka din nahin',
    DUPLICATE_RECORD: 'Is talib-e-ilm aur tareekh ka rozana record pehle se maujood hai',
    METADATA_UNAVAILABLE: 'Is madrasa ke liye Quran metadata load nahin',
    RANGE_INVALID: 'Surah aur Ayat ki range durust nahin',
    PORTION_CHANGE_NOT_ALLOWED: 'Update mode sirf nateeja badalta hai (status, miqdaar, mayaar, ghaltiyan, notes). Portion khud mukhtalif hai',
    NO_ATTEMPT: 'Is portion ka koi nateeja nahin jise badla jaye',
    CONFLICT_OPEN: 'Is nateeje ka sync conflict pehle hal karein',
    BATCH_FAILED: 'Yeh batch mehfooz nahin ho saka. Import dobara karein',
    INVALID: 'Yeh qeemat durust nahin',
  },
  ur: {
    REQUIRED: '{column} ضروری ہے',
    NOT_ALLOWED: 'اس حصے کے لیے {column} خالی چھوڑیں',
    NOT_PARA_QUARTERS: 'پارے کی مقدار ربع، نصف، ثلاثہ، یا ایک مکمل پارہ ہو',
    UNKNOWN_COLUMN: 'کالم {column} سانچے کا حصہ نہیں، اسے چھوڑ دیا گیا',
    INVALID_DATE: 'تاریخ YYYY-MM-DD میں لکھیں (مثلاً 2026-10-30)',
    FUTURE_DATE: 'یہ تاریخ آنے والی ہے',
    INVALID_NUMBER: 'نمبر لکھیں',
    NOT_WHOLE: 'پورا نمبر لکھیں',
    OUT_OF_RANGE: 'قیمت {min} اور {max} کے درمیان ہونی چاہیے',
    INVALID_ENUM: 'ان میں سے ایک لکھیں: {allowed}',
    TOO_LONG: 'زیادہ سے زیادہ {max} حروف',
    FORMULA_NO_VALUE: 'اس خانے میں فارمولا ہے لیکن محفوظ قیمت نہیں۔ قیمت خود لکھیں',
    DUPLICATE_KEY: 'یہی {column} اس فائل کی کسی اور سطر میں بھی ہے',
    NAME_MATCH: 'اس نام کا طالب علم پہلے سے موجود ہے۔ جائزہ لیں: نئے طالب علم کے لیے ExternalStudentID لکھیں',
    COMPOSITE_MATCH: 'اس طالب علم، تاریخ، حصے اور حصہ نمبر کا حصہ پہلے سے موجود ہے۔ جائزہ لیں: درآمد کے لیے ExternalRecordID لکھیں',
    EXISTS_DIFFERENT: 'پہلے سے مختلف قیمتوں کے ساتھ موجود ہے۔ بدلنے کے لیے اپڈیٹ موڈ چنیں',
    STUDENT_NOT_FOUND: 'طالب علم اس مدرسے میں نہیں ملا',
    CLASS_NOT_FOUND: 'جماعت اس مدرسے میں نہیں ملی',
    CLASS_INACTIVE: 'یہ جماعت بند ہے',
    CLASS_REQUIRED: 'نئے طالب علم کے لیے جماعت ضروری ہے',
    NOT_YOUR_CLASS: 'آپ کی جماعت نہیں',
    STATUS_CHANGE_NOT_ALLOWED: 'طالب علم کی حیثیت صرف مالک یا منتظم بدل سکتا ہے',
    CLASS_NOT_CHANGED: 'درآمد طلبہ کو منتقل نہیں کرتی۔ جماعت نہیں بدلی',
    SESSION_LABEL_REQUIRED: 'سیشن کا نام ضروری ہے',
    SESSION_LABEL_NOT_ALLOWED: 'یہ مدرسہ دن میں ایک رپورٹ رکھتا ہے: سیشن کا نام خالی چھوڑیں',
    SABAQ_USES_LINES: 'سبق لائنوں میں ہوتا ہے',
    UNIT_NOT_ALLOWED: 'اس حصے کے لیے یہ اکائی نہیں',
    SABAQ_SURAH_END: 'سبق کا حصہ ایک سورت میں رہتا ہے: SurahEnd خالی یا SurahStart کے برابر ہو',
    PARA_MISMATCH: 'ParaNumber سورت اور آیات کی حد سے میل نہیں کھاتا',
    ABOVE_TOTAL: 'TotalLines ({max}) سے زیادہ نہیں ہو سکتا',
    ABOVE_ASSIGNED: 'مکمل، دیے گئے سے زیادہ نہیں ہو سکتا',
    QUALITY_NOT_ALLOWED: 'غیر حاضر، مقرر نہیں، یا باقی کے لیے معیار نہیں',
    ATTENDANCE_REQUIRED: 'پہلے اس تاریخ کی حاضری (حاضر، تاخیر، یا آدھا دن) لگائیں',
    NOT_ENROLLED: 'اس تاریخ کو طالب علم کسی جماعت میں نہیں تھا',
    NOT_A_CLASS_DAY: 'اس تاریخ کو جماعت کا دن نہیں',
    DUPLICATE_RECORD: 'اس طالب علم اور تاریخ کا روزانہ ریکارڈ پہلے سے موجود ہے',
    METADATA_UNAVAILABLE: 'اس مدرسے کے لیے قرآن میٹا ڈیٹا موجود نہیں',
    RANGE_INVALID: 'سورت اور آیات کی حد درست نہیں',
    PORTION_CHANGE_NOT_ALLOWED: 'اپڈیٹ موڈ صرف نتیجہ بدلتا ہے (حیثیت، مقدار، معیار، غلطیاں، نوٹس)۔ حصہ خود مختلف ہے',
    NO_ATTEMPT: 'اس حصے کا کوئی نتیجہ نہیں جسے بدلا جائے',
    CONFLICT_OPEN: 'اس نتیجے کا ہم آہنگی کا تنازع پہلے حل کریں',
    BATCH_FAILED: 'یہ بیچ محفوظ نہیں ہو سکا۔ درآمد دوبارہ کریں',
    INVALID: 'یہ قیمت درست نہیں',
  },
};

const REJECTIONS: Record<Locale, Catalogue<WorkbookRejection>> = {
  en: {
    NOT_XLSX: 'Only .xlsx workbooks can be imported',
    FILE_TOO_LARGE: 'The file is too large (at most {max} MB)',
    NO_META: 'This is not a HifzAmanah template: the hidden _meta sheet is missing. Expected template {template} version {version}',
    UNKNOWN_TEMPLATE: 'Unknown template. Expected template {template} version {version}',
    WRONG_TEMPLATE: 'This is the {found} template. Expected template {template} version {version}',
    WRONG_VERSION: 'Template version {found} is not supported. Expected template {template} version {version}',
    NO_SHEET: 'The {template} sheet is missing',
    MISSING_COLUMN: 'Missing required column {column}. Expected template {template} version {version}',
    NO_ROWS: 'No rows found in the {template} sheet',
    TOO_MANY_ROWS: 'Maximum 1,000 rows per file — split into several files',
  },
  'ur-Latn': {
    NOT_XLSX: 'Sirf .xlsx workbook import ho sakti hai',
    FILE_TOO_LARGE: 'File bohat bari hai (ziyada se ziyada {max} MB)',
    NO_META: 'Yeh HifzAmanah template nahin: chhupi _meta sheet maujood nahin. Template {template} version {version} chahiye',
    UNKNOWN_TEMPLATE: 'Na-maloom template. Template {template} version {version} chahiye',
    WRONG_TEMPLATE: 'Yeh {found} template hai. Template {template} version {version} chahiye',
    WRONG_VERSION: 'Template version {found} qabool nahin. Template {template} version {version} chahiye',
    NO_SHEET: '{template} sheet maujood nahin',
    MISSING_COLUMN: 'Zaroori column {column} maujood nahin. Template {template} version {version} chahiye',
    NO_ROWS: '{template} sheet mein koi line nahin mili',
    TOO_MANY_ROWS: 'Aik file mein ziyada se ziyada 1,000 lines — kai files mein taqseem karein',
  },
  ur: {
    NOT_XLSX: 'صرف .xlsx ورک بک درآمد ہو سکتی ہے',
    FILE_TOO_LARGE: 'فائل بہت بڑی ہے (زیادہ سے زیادہ {max} MB)',
    NO_META: 'یہ حفظ امانہ کا سانچہ نہیں: چھپی ہوئی _meta شیٹ موجود نہیں۔ سانچہ {template} ورژن {version} درکار ہے',
    UNKNOWN_TEMPLATE: 'نامعلوم سانچہ۔ سانچہ {template} ورژن {version} درکار ہے',
    WRONG_TEMPLATE: 'یہ {found} سانچہ ہے۔ سانچہ {template} ورژن {version} درکار ہے',
    WRONG_VERSION: 'سانچے کا ورژن {found} قبول نہیں۔ سانچہ {template} ورژن {version} درکار ہے',
    NO_SHEET: '{template} شیٹ موجود نہیں',
    MISSING_COLUMN: 'ضروری کالم {column} موجود نہیں۔ سانچہ {template} ورژن {version} درکار ہے',
    NO_ROWS: '{template} شیٹ میں کوئی سطر نہیں ملی',
    TOO_MANY_ROWS: 'ایک فائل میں زیادہ سے زیادہ 1,000 سطریں — کئی فائلوں میں تقسیم کریں',
  },
};

const fill = (template: string, params: Readonly<Record<string, string | number>> = {}): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (Object.hasOwn(params, key) ? String(params[key]) : whole));

export const issueMessage = (locale: Locale, code: ImportIssueCode, params?: Readonly<Record<string, string | number>>): string => fill(ISSUES[locale][code], params);

export const rejectionMessage = (locale: Locale, code: WorkbookRejection, params?: Readonly<Record<string, string | number>>): string =>
  fill(REJECTIONS[locale][code], params);

/** Every catalogue has every code (checked by the unit tests). */
export const catalogues = { ISSUES, REJECTIONS };

/** The caller's language: `?locale=`, else the first supported Accept-Language tag, else English. */
export function localeOf(explicit: Locale | undefined, acceptLanguage: string | undefined): Locale {
  if (explicit) return explicit;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]!.trim().toLowerCase();
    if (tag === 'ur-latn' || tag.startsWith('ur-latn-')) return 'ur-Latn';
    if (tag === 'ur' || tag.startsWith('ur-')) return 'ur';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}
