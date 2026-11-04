//! Test builds only: the system allocator, watched per thread for the largest single allocation, so a test can prove
//! that a step allocates nothing of an input's size (task 56 fix 5: the scrolled rule and a 64 MiB paste).

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

thread_local! {
    static LARGEST: Cell<usize> = const { Cell::new(0) };
}

fn saw(size: usize) {
    let _ = LARGEST.try_with(|largest| largest.set(largest.get().max(size)));
}

struct Watched;

// SAFETY: every call is passed to the system allocator unchanged; the watch only records sizes in a thread-local
// `Cell` that is const-initialized and has no destructor, so recording allocates nothing.
unsafe impl GlobalAlloc for Watched {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        saw(layout.size());
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        saw(layout.size());
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        saw(new_size);
        unsafe { System.realloc(ptr, layout, new_size) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static WATCHED: Watched = Watched;

/// What `f` returns, and the largest single allocation this thread made while it ran.
pub fn largest_allocation<T>(f: impl FnOnce() -> T) -> (T, usize) {
    let before = LARGEST.with(|largest| largest.replace(0));
    let value = f();
    let during = LARGEST.with(|largest| largest.replace(before.max(largest.get())));
    (value, during)
}
