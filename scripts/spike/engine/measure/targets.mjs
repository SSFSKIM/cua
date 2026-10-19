// What names each scene's window and what the probes act on (measure.mjs; the scenes are ../scenes.mjs). Shared by
// ./lane.mjs and ./input-groups.mjs.
import {SCENES} from '../scenes.mjs';
import {PAGE_TITLE} from '../fixtures/scene-page.mjs';

// A prefix of each scene window's title, as the front-window checks compare it.
export const SCENE_WINDOW = Object.freeze({textedit: 'cua-scene', finder: SCENES.finder.fixedState.folder, chrome: PAGE_TITLE, electron: SCENES.electron.fixedState.title});
// Finder's target is a cell of row 005 other than its name (indexOfRowCell): a click on a selected row's name renames it.
export const ACTION_TARGET = Object.freeze({textedit: SCENES.textedit.fixedState.firstLine, finder: Object.freeze({rowCellOf: 'scene-file-005'}), chrome: 'Scene option', electron: 'Fixture button'});
export const KEY_PROBE = Object.freeze({textedit: 'shift+Right', finder: 'Down', chrome: 'Tab', electron: 'Tab'});
// The user window each driven scene runs behind (scenes.mjs's pairings).
export const USER_WINDOW = Object.freeze({textedit: 'finder', finder: 'textedit', chrome: 'textedit', electron: 'finder'});
// The text field of the web scenes, where typing lands.
export const TEXT_TARGET = Object.freeze({chrome: 'Scene notes', electron: 'Fixture text'});
