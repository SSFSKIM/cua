// MIT-SHM from inside a sandbox (#115 M0, Linux probe a; docs/doperpowers/specs/2026-10-17-own-sandbox-design.md,
// "Linux computer sessions"). The original Linux helper always passes bwrap --unshare-ipc, so a System V segment the
// client creates lives in a private IPC namespace the X server cannot see: XShmQueryExtension can succeed while
// XShmAttach then fails with BadAccess, or, worse, the server resolves the client's segment id in its own namespace
// and attaches whatever segment carries that id there. This client asks exactly that, on the display in $DISPLAY, and
// prints one JSON object: whether the extension answered, the segment id it got, the X error XShmAttach drew (if any),
// whether a 64x64 XShmGetImage and a plain XGetImage of the root window succeeded, and whether the image actually
// arrived in the client's own segment (the buffer is filled with a pattern first; any change means the server wrote
// into it). It reads no window content: the bytes are only compared with the pattern.
//
//   cc -O2 -o xshm-probe scripts/sandbox-probe/xshm-probe.c -lX11 -lXext
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/shm.h>

static int x_error_code = 0;
static int x_error_request = 0;
static int x_error_minor = 0;

static int on_error(Display *display, XErrorEvent *event) {
  (void)display;
  x_error_code = event->error_code;
  x_error_request = event->request_code;
  x_error_minor = event->minor_code;
  return 0;
}

static const char *error_name(int code) {
  switch (code) {
    case 0: return "none";
    case BadAccess: return "BadAccess";
    case BadValue: return "BadValue";
    case BadAlloc: return "BadAlloc";
    case BadMatch: return "BadMatch";
    case BadImplementation: return "BadImplementation";
    default: return "other";
  }
}

int main(void) {
  Display *display = XOpenDisplay(NULL);
  if (!display) {
    printf("{\"display\":false}\n");
    return 2;
  }
  XSetErrorHandler(on_error);
  int major = 0, minor = 0;
  Bool pixmaps = False;
  Bool extension = XShmQueryExtension(display);
  Bool version = extension ? XShmQueryVersion(display, &major, &minor, &pixmaps) : False;

  Window root = DefaultRootWindow(display);
  Visual *visual = DefaultVisual(display, DefaultScreen(display));
  int depth = DefaultDepth(display, DefaultScreen(display));

  // The plain path, which a client falls back to without MIT-SHM.
  x_error_code = 0;
  XImage *plain = XGetImage(display, root, 0, 0, 64, 64, AllPlanes, ZPixmap);
  XSync(display, False);
  int plain_ok = plain != NULL && x_error_code == 0;
  if (plain) XDestroyImage(plain);

  int shmget_errno = 0, shmat_errno = 0, attach_status = -1, get_ok = 0, shmid = -1, buffer_changed = 0;
  int attach_error = 0, attach_request = 0, attach_minor = 0;
  if (extension) {
    XShmSegmentInfo info;
    memset(&info, 0, sizeof info);
    XImage *image = XShmCreateImage(display, visual, depth, ZPixmap, NULL, &info, 64, 64);
    if (image) {
      size_t bytes = (size_t)image->bytes_per_line * image->height;
      info.shmid = shmid = shmget(IPC_PRIVATE, bytes, IPC_CREAT | 0600);
      if (info.shmid < 0) {
        shmget_errno = errno;
      } else {
        info.shmaddr = image->data = shmat(info.shmid, NULL, 0);
        if (info.shmaddr == (char *)-1) {
          shmat_errno = errno;
        } else {
          memset(info.shmaddr, 0xA5, bytes);
          info.readOnly = False;
          x_error_code = 0;
          attach_status = XShmAttach(display, &info);
          XSync(display, False);
          attach_error = x_error_code;
          attach_request = x_error_request;
          attach_minor = x_error_minor;
          if (attach_status && attach_error == 0) {
            x_error_code = 0;
            Status got = XShmGetImage(display, root, image, 0, 0, AllPlanes);
            XSync(display, False);
            get_ok = got && x_error_code == 0;
            for (size_t i = 0; i < bytes; i++) if ((unsigned char)info.shmaddr[i] != 0xA5) { buffer_changed = 1; break; }
            XShmDetach(display, &info);
            XSync(display, False);
          }
          shmdt(info.shmaddr);
        }
        shmctl(info.shmid, IPC_RMID, NULL);
      }
      image->data = NULL;
      XDestroyImage(image);
    }
  }
  printf("{\"display\":true,\"extension\":%s,\"version\":\"%d.%d\",\"versionQuery\":%s,\"sharedPixmaps\":%s,"
         "\"plainGetImage\":%s,\"shmid\":%d,\"shmgetErrno\":%d,\"shmatErrno\":%d,\"attachStatus\":%d,"
         "\"attachError\":\"%s\",\"attachErrorCode\":%d,\"attachErrorRequest\":%d,\"attachErrorMinor\":%d,"
         "\"shmGetImage\":%s,\"imageArrived\":%s}\n",
         extension ? "true" : "false", major, minor, version ? "true" : "false", pixmaps ? "true" : "false",
         plain_ok ? "true" : "false", shmid, shmget_errno, shmat_errno, attach_status, error_name(attach_error), attach_error,
         attach_request, attach_minor, get_ok ? "true" : "false", buffer_changed ? "true" : "false");
  XCloseDisplay(display);
  return 0;
}
