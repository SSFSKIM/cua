// The behavioural fingerprint of a seatbelt launcher for #115 (M0, M1): run under a launcher (the signed
// `codex sandbox`, the public build, cua's own), it asks the kernel's sandbox, through sandbox_check on its own pid,
// whether a fixed matrix of operations is allowed, tries the network directly, and reports its environment and cwd, as
// one JSON object on stdout. Two launchers that render the same profile give the same fingerprint, label for label.
//
//   fingerprint [--path LABEL=/abs/path]... [--tcp LABEL=127.0.0.1:PORT]... [--unix LABEL=/abs/socket]...
//               [--link LABEL=/abs/file]...
//
// Built-in targets are labelled by what they are, not where (the run directory is `cwd`, the session temp `tmpdir`,
// HOME `home`), so fingerprints from different runs compare by label. --path adds a labelled target (the deny-list
// locations, a run directory of another session...). Every operation is checked on the target path itself: sandbox_check
// resolves the path it is given and reports a missing one as denied whatever the profile says (observed on macOS 27),
// so every target must exist; a directory target stands for its subtree, which is how the profiles' subpath rules
// read. process-exec cannot be asked through sandbox_check (EINVAL), so it is attempted: /usr/bin/true is spawned and
// waited for. Links and clones are attempted too: each --link file is hard-linked and cloned (clonefile) into the cwd,
// as a cell would to read a denied file through a writable root, and the attempt's own leftovers are removed.
// Environment values of names that look like credentials (KEY, TOKEN, SECRET, AUTH, PASSWORD) are replaced by
// "<redacted>"; the driver gives the launcher a synthetic environment anyway.
//
// Build (macOS): xcrun clang -O2 -Wall -o /tmp/cua-fp scripts/sandbox-probe/fingerprint.c
#include <arpa/inet.h>
#include <errno.h>
#include <limits.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/sysctl.h>
#include <sys/clonefile.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <spawn.h>
#include <unistd.h>

extern char **environ;

// libsystem_sandbox (private, stable since 10.7): 0 allowed, 1 denied, -1 error.
enum sandbox_filter_type { SANDBOX_FILTER_NONE = 0, SANDBOX_FILTER_PATH = 1, SANDBOX_FILTER_GLOBAL_NAME = 2, SANDBOX_FILTER_PREFERENCE_DOMAIN = 6 };
extern const enum sandbox_filter_type SANDBOX_CHECK_NO_REPORT;
int sandbox_check(pid_t pid, const char *operation, enum sandbox_filter_type type, ...);

static const char *MACH_NAMES[] = {
  "com.apple.cfprefsd.daemon", "com.apple.cfprefsd.agent", "com.apple.system.notification_center",
  "com.apple.system.opendirectoryd.libinfo", "com.apple.system.opendirectoryd.membership", "com.apple.trustd", "com.apple.trustd.agent",
  "com.apple.SecurityServer", "com.apple.PowerManagement.control", "com.apple.system.logger", "com.apple.logd", "com.apple.diagnosticd",
  "com.apple.analyticsd", "com.apple.coreservices.launchservicesd", "com.apple.lsd.mapdb", "com.apple.windowserver.active",
  "com.apple.dnssd.service", "com.apple.networkd", "com.apple.SystemConfiguration.DNSConfiguration", "com.apple.SystemConfiguration.configd",
  "com.apple.system.DirectoryService.membership_v1", "com.apple.bsd.dirhelper", "com.apple.ocspd", "com.apple.distributed_notifications@Uv3",
  "com.apple.pasteboard.1", "com.apple.tccd", "com.apple.tccd.system", "com.apple.audio.coreaudiod", "com.apple.FontObjectsServer",
  "com.apple.fonts", "com.apple.CoreServices.coreservicesd", "com.apple.TrustEvaluationAgent",
};

typedef struct { const char *label; char path[PATH_MAX]; } target_t;

static int first = 1;
static void json_string(const char *s) {
  putchar('"');
  for (; *s; s++) {
    unsigned char c = (unsigned char)*s;
    if (c == '"' || c == '\\') printf("\\%c", c);
    else if (c == '\n') fputs("\\n", stdout);
    else if (c < 0x20) printf("\\u%04x", c);
    else putchar(c);
  }
  putchar('"');
}
static void check_row(const char *op, const char *filter, const char *label, const char *target, int result, int err) {
  printf("%s\n    {\"op\":", first ? "" : ",");
  first = 0;
  json_string(op);
  printf(",\"filter\":");
  json_string(filter);
  printf(",\"label\":");
  json_string(label);
  printf(",\"target\":");
  if (target) json_string(target); else fputs("null", stdout);
  printf(",\"result\":%s", result == 0 ? "\"allow\"" : result == 1 ? "\"deny\"" : "\"error\"");
  if (result < 0) printf(",\"errno\":%d", err);
  putchar('}');
}
static void check_path(const char *op, const char *label, const char *path) {
  errno = 0;
  int r = sandbox_check(getpid(), op, SANDBOX_FILTER_PATH | SANDBOX_CHECK_NO_REPORT, path);
  check_row(op, "path", label, path, r, errno);
}
static void attempt_row(const char *kind, const char *label, const char *target, int ok, int err) {
  printf("%s\n    {\"op\":", first ? "" : ",");
  first = 0;
  json_string(kind);
  printf(",\"filter\":\"attempt\",\"label\":");
  json_string(label);
  printf(",\"target\":");
  json_string(target);
  printf(",\"result\":%s", ok ? "\"allow\"" : "\"deny\"");
  if (!ok) printf(",\"errno\":%d", err);
  putchar('}');
}
static void try_tcp(const char *label, const char *spec) {
  char host[64];
  const char *colon = strrchr(spec, ':');
  if (!colon || (size_t)(colon - spec) >= sizeof(host)) return;
  memcpy(host, spec, (size_t)(colon - spec));
  host[colon - spec] = '\0';
  struct sockaddr_in sin = {.sin_family = AF_INET, .sin_port = htons((uint16_t)atoi(colon + 1))};
  inet_pton(AF_INET, host, &sin.sin_addr);
  int fd = socket(AF_INET, SOCK_STREAM, 0), ok = 0, err = 0;
  if (fd < 0) err = errno;
  else { ok = connect(fd, (struct sockaddr *)&sin, sizeof(sin)) == 0; if (!ok) err = errno; close(fd); }
  attempt_row("connect-tcp", label, spec, ok, err);
}
static void try_unix(const char *label, const char *path) {
  struct sockaddr_un sun = {.sun_family = AF_UNIX};
  strncpy(sun.sun_path, path, sizeof(sun.sun_path) - 1);
  int fd = socket(AF_UNIX, SOCK_STREAM, 0), ok = 0, err = 0;
  if (fd < 0) err = errno;
  else { ok = connect(fd, (struct sockaddr *)&sun, sizeof(sun)) == 0; if (!ok) err = errno; close(fd); }
  attempt_row("connect-unix", label, path, ok, err);
}
static int secretish(const char *name, size_t n) {
  static const char *needles[] = {"KEY", "TOKEN", "SECRET", "AUTH", "PASSWORD"};
  for (size_t i = 0; i < sizeof(needles) / sizeof(needles[0]); i++) {
    size_t m = strlen(needles[i]);
    for (size_t j = 0; j + m <= n; j++)
      if (strncasecmp(name + j, needles[i], m) == 0) return 1;
  }
  return 0;
}

int main(int argc, char **argv) {
  target_t paths[128];
  int npaths = 0;
  const char *tcp[16], *tcp_label[16], *uds[16], *uds_label[16], *links[16], *link_label[16];
  int ntcp = 0, nuds = 0, nlinks = 0;
  char cwd[PATH_MAX] = "";
  if (!getcwd(cwd, sizeof(cwd))) cwd[0] = '\0';
  const char *home = getenv("HOME"), *tmp = getenv("TMPDIR");
  #define ADD(L, P) do { if ((P) && *(P) && npaths < 128) { paths[npaths].label = (L); strncpy(paths[npaths].path, (P), PATH_MAX - 1); paths[npaths].path[PATH_MAX - 1] = '\0'; npaths++; } } while (0)
  ADD("cwd", cwd);
  ADD("tmpdir", tmp);
  ADD("home", home);
  ADD("/private/tmp", "/private/tmp");
  ADD("/private/var/tmp", "/private/var/tmp");
  ADD("/usr/bin", "/usr/bin");
  ADD("/System/Library", "/System/Library");
  ADD("/Library/Preferences", "/Library/Preferences");
  ADD("/Applications", "/Applications");
  ADD("/private/etc/hosts", "/private/etc/hosts");
  ADD("/private/var/db", "/private/var/db");
  ADD("/dev/null", "/dev/null");
  ADD("/Users", "/Users");
  for (int i = 1; i < argc; i += 2) {
    char *eq = i + 1 < argc ? strchr(argv[i + 1], '=') : NULL;
    if (!eq) { fprintf(stderr, "fingerprint: %s needs LABEL=VALUE\n", argv[i]); return 2; }
    *eq = '\0';
    if (!strcmp(argv[i], "--path")) ADD(argv[i + 1], eq + 1);
    else if (!strcmp(argv[i], "--tcp") && ntcp < 16) { tcp_label[ntcp] = argv[i + 1]; tcp[ntcp++] = eq + 1; }
    else if (!strcmp(argv[i], "--unix") && nuds < 16) { uds_label[nuds] = argv[i + 1]; uds[nuds++] = eq + 1; }
    else if (!strcmp(argv[i], "--link") && nlinks < 16) { link_label[nlinks] = argv[i + 1]; links[nlinks++] = eq + 1; }
    else { fprintf(stderr, "fingerprint: unknown argument %s\n", argv[i]); return 2; }
  }

  printf("{\n  \"pid\": %d,\n  \"cwd\": ", getpid());
  json_string(cwd);
  printf(",\n  \"sandboxed\": %s,\n  \"env\": {", sandbox_check(getpid(), NULL, SANDBOX_FILTER_NONE) == 1 ? "true" : "false");
  int efirst = 1;
  for (char **e = environ; *e; e++) {
    const char *eq = strchr(*e, '=');
    if (!eq) continue;
    char name[256];
    size_t n = (size_t)(eq - *e) < sizeof(name) - 1 ? (size_t)(eq - *e) : sizeof(name) - 1;
    memcpy(name, *e, n);
    name[n] = '\0';
    printf("%s\n    ", efirst ? "" : ",");
    efirst = 0;
    json_string(name);
    putchar(':');
    json_string(secretish(name, n) ? "<redacted>" : eq + 1);
  }
  printf("\n  },\n  \"checks\": [");

  static const char *path_ops[] = {"file-read-data", "file-read-metadata", "file-write-data", "file-write-create", "file-write-unlink", "file-link", "file-clone"};
  for (int i = 0; i < npaths; i++)
    for (size_t o = 0; o < sizeof(path_ops) / sizeof(path_ops[0]); o++) check_path(path_ops[o], paths[i].label, paths[i].path);
  static const char *execs[] = {"/usr/bin/true", "/bin/sh"};
  for (size_t i = 0; i < 2; i++) {
    pid_t child;
    char *const args[] = {(char *)execs[i], "-c", "true", NULL};
    char *const argv_true[] = {(char *)execs[i], NULL};
    int rc = posix_spawn(&child, execs[i], NULL, NULL, i ? args : argv_true, environ), status = 0;
    int ok = rc == 0 && waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0;
    attempt_row("process-exec", execs[i], execs[i], ok, rc);
  }
  for (size_t i = 0; i < sizeof(MACH_NAMES) / sizeof(MACH_NAMES[0]); i++) {
    errno = 0;
    int r = sandbox_check(getpid(), "mach-lookup", SANDBOX_FILTER_GLOBAL_NAME | SANDBOX_CHECK_NO_REPORT, MACH_NAMES[i]);
    check_row("mach-lookup", "global-name", MACH_NAMES[i], MACH_NAMES[i], r, errno);
  }
  static const char *domains[] = {".GlobalPreferences", "com.apple.Terminal"};
  for (size_t i = 0; i < 2; i++) {
    errno = 0;
    int r = sandbox_check(getpid(), "user-preference-read", SANDBOX_FILTER_PREFERENCE_DOMAIN | SANDBOX_CHECK_NO_REPORT, domains[i]);
    check_row("user-preference-read", "preference-domain", domains[i], domains[i], r, errno);
  }
  static const char *plain[] = {"network-outbound", "network-inbound", "network-bind", "sysctl-read", "sysctl-write", "process-fork",
    "signal", "iokit-open-user-client", "system-socket", "ipc-posix-shm-read-data", "file-ioctl", "system-fcntl"};
  for (size_t i = 0; i < sizeof(plain) / sizeof(plain[0]); i++) {
    errno = 0;
    int r = sandbox_check(getpid(), plain[i], SANDBOX_FILTER_NONE | SANDBOX_CHECK_NO_REPORT);
    check_row(plain[i], "none", plain[i], NULL, r, errno);
  }
  int ostype_mib[2] = {CTL_KERN, KERN_OSTYPE};
  char ostype[64];
  size_t olen = sizeof(ostype);
  int sok = sysctl(ostype_mib, 2, ostype, &olen, NULL, 0) == 0;
  attempt_row("sysctl", "kern.ostype", "kern.ostype", sok, sok ? 0 : errno);
  for (int i = 0; i < nlinks; i++) {
    char dest[PATH_MAX];
    snprintf(dest, sizeof(dest), "%s/cua-fingerprint-link-%d", cwd, i);
    int ok = link(links[i], dest) == 0, err = ok ? 0 : errno;
    if (ok) unlink(dest);
    attempt_row("link", link_label[i], links[i], ok, err);
    snprintf(dest, sizeof(dest), "%s/cua-fingerprint-clone-%d", cwd, i);
    ok = clonefile(links[i], dest, 0) == 0;
    err = ok ? 0 : errno;
    if (ok) unlink(dest);
    attempt_row("clonefile", link_label[i], links[i], ok, err);
  }
  for (int i = 0; i < ntcp; i++) try_tcp(tcp_label[i], tcp[i]);
  try_unix("mDNSResponder", "/private/var/run/mDNSResponder");
  for (int i = 0; i < nuds; i++) try_unix(uds_label[i], uds[i]);
  printf("\n  ]\n}\n");
  return 0;
}
