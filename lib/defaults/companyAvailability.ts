export type DayAvailability = {
  available: boolean;
  startTime: string;
  endTime: string;
};

export type CompanyAvailability = {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
};

export const DEFAULT_COMPANY_AVAILABILITY: CompanyAvailability = {
  monday: { available: true, startTime: '09:00', endTime: '17:00' },
  tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
  wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
  thursday: { available: true, startTime: '09:00', endTime: '17:00' },
  friday: { available: true, startTime: '09:00', endTime: '17:00' },
  saturday: { available: false, startTime: '09:00', endTime: '17:00' },
  sunday: { available: false, startTime: '09:00', endTime: '17:00' },
};
