// The engines' error names (SkyComputerUseError.errorName), in one place: the finite set src/services/sky.mjs publishes
// as a call's `cua/errorName` result meta, which the REPL's boundary would otherwise drop (the trusted worker passes a
// rejection's message alone, and the cell catches a plain Error). The native matrix's judge (scripts/native-matrix/
// answers.mjs) reads its refusal and unconfirmed kinds from these names; its lists are tested against this set.
//
//   VENDOR_ERROR_NAMES  the pinned vendor client's ServerErrorCode names (./protocol.mjs VENDOR_CODES), and its name for
//                       an error without a code of its own (jsonRPCError): what either engine raises for a vendor code
//   ENGINE_ERROR_NAMES  cua's engine's own names (native/engine/Sources/Engine: every `EngineError(name: "…")`, the
//                       minimized window's name, JSON-RPC's codes as Protocol.swift names them) and the service's own
//                       (./observations.mjs invalidElementID); test/services-engine-error-names.test.mjs keeps it equal to
//                       the Swift sources'
import {VENDOR_CODES} from './protocol.mjs';

export const VENDOR_ERROR_NAMES = Object.freeze([...Object.keys(VENDOR_CODES), 'jsonRPCError']);

export const ENGINE_ERROR_NAMES = Object.freeze([
  // EngineError(name: "…")
  'actionFailed', 'activationFailed', 'appWindowOverPoint', 'backgroundClickRefused', 'busy', 'cannotClickOffscreenElement', 'clickUnconfirmed',
  'clipboardConflict', 'clipboardReadTimedOut', 'clipboardWriteFailed', 'concealedInputUnavailable', 'desktopGateClosed', 'elementAmbiguousAfterRefetch',
  'elementAmbiguousBeforeRefetch', 'elementNoLongerValid', 'encodingFailed', 'eventCreationFailed', 'foregroundRestoreFailed', 'inputSourceChanged',
  'internalError', 'invalidArguments', 'invalidDate', 'invalidKey', 'invalidNumber', 'invalidScrollPages', 'invalidSecondaryAction',
  'keyboardLayoutUnavailable', 'launchFailed', 'menuActivationLapsed', 'menuBarItemUnsupported', 'menuUnconfirmed', 'noCapturableWindow',
  'noScreenshotForCoordinates', 'noWindowsAvailable', 'pasteUnconfirmed', 'pointOutsideScreenshot', 'responseTooLarge', 'screenCaptureFailed',
  'screenChangedSinceScreenshot', 'scrollUnconfirmed', 'selectionNotSettable', 'textNotFound', 'timeoutReached', 'typeUnconfirmed', 'unknownMethod',
  'unsupportedValueType', 'valueNotSettable', 'valueUnconfirmed', 'windowOnAnotherSpace',
  // Minimized.swift windowMinimizedReason
  'windowMinimized',
  // Protocol.swift RPCCode
  'parseError', 'invalidRequest', 'methodNotFound', 'invalidParams', 'deadlineExceeded',
  // the service's own (./observations.mjs)
  'invalidElementID',
]);

const NAMES = new Set([...VENDOR_ERROR_NAMES, ...ENGINE_ERROR_NAMES]);
export const isErrorName = name => typeof name === 'string' && NAMES.has(name);

// The engine's name for the error a call threw: an engine error (either engine's SkyComputerUseError) whose errorName is
// one of the set. -> the name, or null for anything else (a transport failure, the wrapper's own diagnostics, a name
// outside the set).
export const errorNameOf = error => (error instanceof Error && error.name === 'SkyComputerUseError' && isErrorName(error.errorName) ? error.errorName : null);
