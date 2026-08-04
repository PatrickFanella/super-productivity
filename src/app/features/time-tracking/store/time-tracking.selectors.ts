import { createFeatureSelector, createSelector } from '@ngrx/store';
import * as fromTimeTracking from './time-tracking.reducer';
import { TimeTrackingState } from '../time-tracking.model';

export const selectTimeTrackingState = createFeatureSelector<TimeTrackingState>(
  fromTimeTracking.TIME_TRACKING_FEATURE_KEY,
);

export const selectSharedActiveSession = createSelector(
  selectTimeTrackingState,
  (state) => state.activeSession ?? null,
);
