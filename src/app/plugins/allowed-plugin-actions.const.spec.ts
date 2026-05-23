import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import {
  addTaskRepeatCfgToTask,
  deleteTaskRepeatCfgInstance,
  updateTaskRepeatCfg,
} from '../features/task-repeat-cfg/store/task-repeat-cfg.actions';
import { isAllowedPluginAction } from './allowed-plugin-actions.const';

describe('allowed plugin actions', () => {
  it('allows task repeat config actions for plugin-dispatched recurrence edits', () => {
    expect(isAllowedPluginAction({ type: addTaskRepeatCfgToTask.type })).toBeTrue();
    expect(isAllowedPluginAction({ type: updateTaskRepeatCfg.type })).toBeTrue();
    expect(isAllowedPluginAction({ type: deleteTaskRepeatCfgInstance.type })).toBeTrue();
    expect(
      isAllowedPluginAction({ type: TaskSharedActions.deleteTaskRepeatCfg.type }),
    ).toBeTrue();
  });

  it('still rejects unknown plugin actions', () => {
    expect(isAllowedPluginAction({ type: '[TaskRepeatCfg] Unsafe Unknown' })).toBeFalse();
  });
});
