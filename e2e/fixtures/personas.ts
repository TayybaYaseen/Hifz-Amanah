// Synthetic E2E personas. Never use real student data (AGENTS.md §6).
// Seeded into a fresh environment before each run by the test-control API (NFR-MNT-005). Owner and Admin personas also get a seeded TOTP secret (FR-AUTH-016).
// Passwords are test-only and exist only in non-production seed data.

export const TEST_PASSWORD = 'E2e-Test-Pass-1'; // Meets FR-AUTH-012 (8–64 characters, not a common password, not a User ID)

export const madaris = {
  A: { name: 'Madrasa Alif (test)', timezone: 'Asia/Karachi', weekStart: 'MONDAY', reportMode: 'SINGLE' },
  B: { name: 'Madrasa Baa (test)', timezone: 'Asia/Karachi', weekStart: 'MONDAY', reportMode: 'SINGLE' },
} as const;

export const classes = {
  A1: { madrasa: 'A', name: 'Hifz A1', schedule: 'MON-SAT', teachers: ['teacher.a1'] },
  A2: { madrasa: 'A', name: 'Hifz A2', schedule: 'MON-SAT', teachers: ['teacher.a2'] },
  B1: { madrasa: 'B', name: 'Hifz B1', schedule: 'MON-SAT', teachers: ['teacher.b1'] },
} as const;

export const personas = {
  'owner.a': { madrasa: 'A', role: 'OWNER', email: 'owner.a@example.test' },
  'admin.a': { madrasa: 'A', role: 'ADMIN', email: 'admin.a@example.test' },
  'teacher.a1': { madrasa: 'A', role: 'TEACHER', email: 'teacher.a1@example.test' },
  'teacher.a2': { madrasa: 'A', role: 'TEACHER', email: 'teacher.a2@example.test' },
  // Student and Parent share one email (US-005).
  'student.s1': { madrasa: 'A', role: 'STUDENT', email: 'family1@example.test', student: 'S1' },
  'student.s3': { madrasa: 'A', role: 'STUDENT', email: null, student: 'S3' },
  'parent.p1': { madrasa: 'A', role: 'PARENT', email: 'family1@example.test', links: { S1: 'VERIFIED', S2: 'VERIFIED' } },
  'parent.p2': { madrasa: 'A', role: 'PARENT', email: 'parent.p2@example.test', links: { S3: 'REVOKED' } },
  'admin.b': { madrasa: 'B', role: 'ADMIN', email: 'admin.b@example.test' },
  // Same person as teacher.a2, separate account in Madrasa B (US-006).
  'teacher.b1': { madrasa: 'B', role: 'TEACHER', email: 'teacher.a2@example.test' },
} as const;

export const students = {
  S1: { madrasa: 'A', class: 'A1', name: 'Test Student One', externalId: 'EXT-A-001' },
  S2: { madrasa: 'A', class: 'A1', name: 'Test Student Two', externalId: 'EXT-A-002' },
  S3: { madrasa: 'A', class: 'A2', name: 'Test Student Three', externalId: 'EXT-A-003' },
  SB1: { madrasa: 'B', class: 'B1', name: 'Test Student Bee', externalId: 'EXT-B-001' },
} as const;

export type PersonaKey = keyof typeof personas;
export type StudentKey = keyof typeof students;
