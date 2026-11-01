// Registers the desktop gate's test observer (EngineTests/DesktopGateObserver.swift) as the test bundle loads, before any
// test runs, so no test can run without it: a call the closed gate refuses (Sources/Engine/DesktopGate.swift) fails the
// test that made it. By name and through the runtime, so this target needs no XCTest headers.
#import <Foundation/Foundation.h>
#import <objc/message.h>
#include <stdio.h>

__attribute__((constructor)) static void CUARegisterDesktopGateObserver(void) {
  Class center = NSClassFromString(@"XCTestObservationCenter");
  Class observerClass = NSClassFromString(@"CUADesktopGateObserver");
  if (center == Nil || observerClass == Nil) {
    fprintf(stderr, "cua-engine tests: the desktop gate's observer could not be registered (XCTestObservationCenter %s, CUADesktopGateObserver %s)\n",
            center == Nil ? "missing" : "found", observerClass == Nil ? "missing" : "found");
    return;
  }
  id shared = ((id (*)(id, SEL))objc_msgSend)(center, NSSelectorFromString(@"sharedTestObservationCenter"));
  id observer = ((id (*)(id, SEL))objc_msgSend)(((id (*)(id, SEL))objc_msgSend)(observerClass, NSSelectorFromString(@"alloc")), NSSelectorFromString(@"init"));
  ((void (*)(id, SEL, id))objc_msgSend)(shared, NSSelectorFromString(@"addTestObserver:"), observer);
}
