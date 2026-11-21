/* Task 130: a cua-free drag on X11's background route, for the Chromium bug repro. It sends core events with
 * SendEvent to one window, as cua 0.4.2 does there: EnterNotify and a motion at the start, ButtonPress, then one
 * motion per pixel along the waypoints (each segment a->b visited at n = max(1, floor(distance)) steps, the joint twice),
 * button 1 held, one every <step_us> by elapsed time (a late sample does not delay the ones after it), each followed by
 * a round trip (XSync), and ButtonRelease at once after the last. Only libX11 is linked; its few declarations are
 * written out here, the VM having no X11 headers.
 *   synth-drag <window> <window x> <window y> <step us> <x0> <y0> <x1> <y1> ...   (waypoints in window coordinates) */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

typedef unsigned long Window;
typedef unsigned long Time;
typedef int Bool;
typedef struct _XDisplay Display;
typedef struct { int type; unsigned long serial; Bool send_event; Display *display; Window window, root, subwindow; Time time;
  int x, y, x_root, y_root; unsigned int state; char is_hint; Bool same_screen; } XMotionEvent;
typedef struct { int type; unsigned long serial; Bool send_event; Display *display; Window window, root, subwindow; Time time;
  int x, y, x_root, y_root; unsigned int state; unsigned int button; Bool same_screen; } XButtonEvent;
typedef struct { int type; unsigned long serial; Bool send_event; Display *display; Window window, root, subwindow; Time time;
  int x, y, x_root, y_root; int mode, detail; Bool same_screen, focus; unsigned int state; } XCrossingEvent;
typedef union { int type; XMotionEvent motion; XButtonEvent button; XCrossingEvent crossing; long pad[24]; } XEvent;
extern Display *XOpenDisplay(const char *);
extern int XSendEvent(Display *, Window, Bool, long, XEvent *);
extern int XSync(Display *, Bool);
extern Window XDefaultRootWindow(Display *);
enum { MotionNotify = 6, ButtonPress = 4, ButtonRelease = 5, EnterNotify = 7, Button1Mask = 1 << 8 };

static Display *dpy; static Window win, root; static int wx, wy;
static double now_us(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e6 + t.tv_nsec / 1e3; }
static void wait_until(double due) { double d; while ((d = due - now_us()) > 0) { struct timespec s = { 0, (long)(d * 1000) }; nanosleep(&s, 0); } }
static void send(int type, int x, int y, unsigned int state) {
  XEvent e = { 0 };
  e.type = type;
  if (type == EnterNotify) { XCrossingEvent *c = &e.crossing; c->window = win; c->root = root; c->x = x; c->y = y; c->x_root = x + wx; c->y_root = y + wy; c->detail = 3; c->same_screen = 1; c->state = state; }
  else if (type == MotionNotify) { XMotionEvent *m = &e.motion; m->window = win; m->root = root; m->x = x; m->y = y; m->x_root = x + wx; m->y_root = y + wy; m->state = state; m->same_screen = 1; }
  else { XButtonEvent *b = &e.button; b->window = win; b->root = root; b->x = x; b->y = y; b->x_root = x + wx; b->y_root = y + wy; b->state = state; b->button = 1; b->same_screen = 1; }
  XSendEvent(dpy, win, 0, 0, &e);
  XSync(dpy, 0);
}

int main(int argc, char **argv) {
  if (argc < 9 || (argc - 5) % 2) { fprintf(stderr, "usage: synth-drag <window> <wx> <wy> <step us> <x0> <y0> <x1> <y1> ...\n"); return 2; }
  if (!(dpy = XOpenDisplay(0))) { fprintf(stderr, "no display\n"); return 1; }
  win = strtoul(argv[1], 0, 0); wx = atoi(argv[2]); wy = atoi(argv[3]);
  double step = atof(argv[4]);
  root = XDefaultRootWindow(dpy);
  int n = (argc - 5) / 2, *px = malloc(n * sizeof(int)), *py = malloc(n * sizeof(int));
  for (int i = 0; i < n; i++) { px[i] = atoi(argv[5 + 2 * i]); py[i] = atoi(argv[6 + 2 * i]); }
  send(EnterNotify, px[0], py[0], 0);
  send(MotionNotify, px[0], py[0], 0);
  send(ButtonPress, px[0], py[0], 0);
  double due = now_us(); long samples = 0; int lx = px[0], ly = py[0];
  for (int j = 0; j + 1 < n; j++) {
    long dx = px[j + 1] - px[j], dy = py[j + 1] - py[j], k = (long)hypot(dx, dy); if (k < 1) k = 1;
    for (long i = 0; i <= k; i++) {
      lx = px[j] + i * dx / k; ly = py[j] + i * dy / k;
      wait_until(due); send(MotionNotify, lx, ly, Button1Mask); due += step; samples++;
    }
  }
  send(ButtonRelease, lx, ly, Button1Mask);
  printf("%ld motions\n", samples);
  return 0;
}
