import * as _ from 'lodash';

import { funcify } from '../../utils';

// `setter` generates a reducer for setting, or re-setting, a
// single value in the Redux store.
//
// action.type  - Redux action type
// action.payload - value to set (no merging, etc.)
export function setter(actionType, resetActionType, resetValue) {
  return function(state = resetValue, action) {
    switch (action.type) {
      case resetActionType:
        return funcify(resetValue);
      case actionType:
        return action.payload;
      default:
        return state;
    }
  };
}

// `toggle` generates a reducer that flips a single boolean value.
//
// action.type  - Redux action type
export function toggle(actionType, resetActionType, resetValue) {
  return function(state = resetValue, action) {
    switch (action.type) {
      case resetActionType:
        return funcify(resetValue);
      case actionType:
        return !state;
      default:
        return state;
    }
  };
}

// `keyedSetter` generates a reducer that manages a single object
// as a key-value map. Entries are set as scalars (i.e., no merging).
//
// action.type  - Redux action type
// action.key - the key to look up inside the Redux store
// action.payload - value to set (no merging, etc.)
export function keyedSetter(actionType, resetActionType) {
  return function(state = {}, action) {
    let ret;
    switch (action.type) {
      case resetActionType:
        ret = _.cloneDeep(state);
        delete ret[action.key];
        return ret;
      case actionType:
        ret = _.cloneDeep(state);
        ret[action.key] = action.payload;
        return ret;
      default:
        return state;
    }
  };
}
