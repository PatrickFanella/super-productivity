import { ScheduleConfig } from '../config/global-config.model';

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (clockTime: string): number => {
  const [hours, minutes] = clockTime.split(':').map(Number);
  const minutesFromHours = hours * 60;
  const totalMinutes = minutesFromHours + minutes;
  const normalizedMinutes = totalMinutes % MINUTES_PER_DAY;
  return (normalizedMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
};

const isInTimeRange = (
  current: number,
  start: number,
  end: number,
  isEqualRangeAllDay: boolean = false,
): boolean => {
  if (start === end) {
    return isEqualRangeAllDay;
  }

  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};

/**
 * Returns whether the tracking reminder should be quiet for the current local time.
 * Schedule times are wall-clock times, so this deliberately uses the local clock.
 */
export const isTrackingReminderSuppressedBySchedule = (
  schedule: ScheduleConfig,
  now: Date,
): boolean => {
  const minutesFromHours = now.getHours() * 60;
  const current = minutesFromHours + now.getMinutes();

  if (
    schedule.isWorkStartEndEnabled &&
    !isInTimeRange(
      current,
      toMinutes(schedule.workStart),
      toMinutes(schedule.workEnd),
      true,
    )
  ) {
    return true;
  }

  return (
    schedule.isLunchBreakEnabled &&
    isInTimeRange(
      current,
      toMinutes(schedule.lunchBreakStart),
      toMinutes(schedule.lunchBreakEnd),
    )
  );
};
