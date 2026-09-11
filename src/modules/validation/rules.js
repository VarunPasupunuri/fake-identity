import { isValidIsoDate } from './mrz.js';
import { UNIVERSAL_FIELD_LABELS } from '../documents/fields.js';

const ISO3 = /^[A-Z]{3}$/;

export const DOC_NUMBER_PATTERNS = {
  passport: { re: /^[A-Z0-9]{6,9}$/, hint: '6–9 letters/digits' },
  visa: { re: /^[A-Z0-9]{6,12}$/, hint: '6–12 letters/digits' },
  national_id: { re: /^[A-Z0-9-]{6,16}$/, hint: '6–16 letters/digits' },
  driving_license: { re: /^[A-Z0-9-/ ]{6,20}$/, hint: '6–20 letters/digits' },
  permit: { re: /^[A-Z0-9-/]{4,20}$/, hint: '4–20 letters/digits' },
};

export const REQUIRED_FIELDS = {
  passport: ['fullName', 'documentNumber', 'nationality', 'dateOfBirth', 'expiryDate', 'gender'],
  visa: ['fullName', 'visaNumber', 'nationality', 'dateOfBirth', 'validUntil'],
  national_id: ['fullName', 'documentNumber', 'dateOfBirth'],
  driving_license: ['fullName', 'documentNumber', 'dateOfBirth', 'expiryDate'],
  permit: ['fullName', 'documentNumber', 'validUntil'],
};

export const FIELD_LABELS = {
  ...UNIVERSAL_FIELD_LABELS,
  fullName: 'Full name',
  surname: 'Surname',
  givenNames: 'Given names',
  documentNumber: 'Document number',
  nationality: 'Nationality',
  issuingCountry: 'Issuing country',
  dateOfBirth: 'Date of birth',
  expiryDate: 'Expiry date',
  gender: 'Gender',
  visaNumber: 'Visa number',
  visaType: 'Visa type',
  entries: 'Entries',
  validFrom: 'Valid from',
  validUntil: 'Valid until',
  stayDuration: 'Duration of stay',
  optionalData: 'Optional data',
};

export function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function ageFromDob(dobIso, now = new Date()) {
  const dob = new Date(`${dobIso}T00:00:00Z`);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export { ISO3 };
