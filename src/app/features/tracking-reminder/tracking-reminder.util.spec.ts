import { ScheduleConfig } from '../config/global-config.model';
import { isTrackingReminderSuppressedBySchedule } from './tracking-reminder.util';

const createSchedule = (overrides: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  isWorkStartEndEnabled: true,
  workStart: '09:00',
  workEnd: '17:00',
  isLunchBreakEnabled: false,
  lunchBreakStart: '12:00',
  lunchBreakEnd: '13:00',
  ...overrides,
});

const at = (hours: number, minutes: number = 0): Date =>
  new Date(2026, 6, 27, hours, minutes);

describe('isTrackingReminderSuppressedBySchedule', () => {
  it('suppresses outside configured work hours, including the end boundary', () => {
    const schedule = createSchedule();

    expect(isTrackingReminderSuppressedBySchedule(schedule, at(8, 59))).toBeTrue();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(9))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(16, 59))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(17))).toBeTrue();
  });

  it('suppresses during a configured lunch break', () => {
    const schedule = createSchedule({
      isLunchBreakEnabled: true,
      lunchBreakStart: '12:00',
      lunchBreakEnd: '13:00',
    });

    expect(isTrackingReminderSuppressedBySchedule(schedule, at(11, 59))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(12))).toBeTrue();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(13))).toBeFalse();
  });

  it('supports overnight work and lunch ranges', () => {
    const schedule = createSchedule({
      workStart: '22:00',
      workEnd: '06:00',
      isLunchBreakEnabled: true,
      lunchBreakStart: '02:00',
      lunchBreakEnd: '02:30',
    });

    expect(isTrackingReminderSuppressedBySchedule(schedule, at(23))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(1))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(2, 15))).toBeTrue();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(3))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(6))).toBeTrue();
  });

  it('does not gate reminders when both schedule options are disabled', () => {
    const schedule = createSchedule({
      isWorkStartEndEnabled: false,
      isLunchBreakEnabled: false,
    });

    expect(isTrackingReminderSuppressedBySchedule(schedule, at(3))).toBeFalse();
  });

  it('treats an equal work range as all-day work and an equal lunch range as no break', () => {
    const schedule = createSchedule({
      workStart: '09:00',
      workEnd: '09:00',
      isLunchBreakEnabled: true,
      lunchBreakStart: '12:00',
      lunchBreakEnd: '12:00',
    });

    expect(isTrackingReminderSuppressedBySchedule(schedule, at(3))).toBeFalse();
    expect(isTrackingReminderSuppressedBySchedule(schedule, at(12))).toBeFalse();
  });
});
