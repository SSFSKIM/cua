// The argv oracle for #115 (M0): spawns a launcher (the signed `codex sandbox`, or any program that execs
// /usr/bin/sandbox-exec in a child) and catches that child's argv and environment from the window between its exec of
// sandbox-exec and sandbox-exec's own exec of the command, while sandbox-exec compiles the profile. Unprivileged: it
// busy-loops proc_listchildpids and KERN_PROCARGS2 from the moment the spawn returns, with bounded retries. eslogger
// would be exact but needs root and Full Disk Access; this needs neither and either catches the exec or says it did not.
//
//   capture-argv [--tries N] [--timeout-ms N] [--target PATH] -- <launcher> [args...]
//
// The launcher runs with this process's environment, cwd and stderr; its stdin and stdout are /dev/null, so this
// process's stdout carries only its own JSON. On a catch it prints one JSON
// object {captured: true, try, execPath, argv, env} on stdout and waits for the launcher (bounded). Without a catch after
// every try it prints {captured: false, tries, attempts} and exits 1. --target (default /usr/bin/sandbox-exec) is the
// exec path to catch.
//
// Each attempt's launcher leads a process group of its own, and every attempt ends with what is left of its tree
// ended: the group, and every descendant of the launcher found while it lives (including one that left the group),
// SIGTERM and then, after a bounded wait, SIGKILL. The Codex launcher does not forward signals to its child, so stopping the launcher alone would
// orphan a stalled child, and retries would pile them up. The launcher is reaped last, so its pid (the group's id) is
// not reused while the group is signalled, and a descendant is signalled only while its start time is the one seen when
// it was found. Anything still alive after the KILL is named on stderr, and the probe exits 3.
//
// Build (macOS): xcrun clang -O2 -Wall -o /tmp/cua-cap scripts/sandbox-probe/capture-argv.c
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <signal.h>
#include <spawn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/sysctl.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

extern char **environ;

static uint64_t now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
}

static void json_string(FILE *out, const char *s, size_t n) {
  fputc('"', out);
  for (size_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)s[i];
    if (c == '"' || c == '\\') fprintf(out, "\\%c", c);
    else if (c == '\n') fputs("\\n", out);
    else if (c == '\t') fputs("\\t", out);
    else if (c < 0x20) fprintf(out, "\\u%04x", c);
    else fputc(c, out);
  }
  fputc('"', out);
}

// KERN_PROCARGS2: int argc, the exec path, NUL padding, argc NUL-terminated argv strings, possibly more NUL padding,
// then NUL-terminated environment strings up to an empty one or the end; the kernel's "apple" strings (stack_guard=..., executable_cdhash=...)
// follow without a separator and come out with them (oracle.mjs drops them by name). Returns the length read, or -1.
static int read_procargs(pid_t pid, char *buf, size_t size) {
  int mib[3] = {CTL_KERN, KERN_PROCARGS2, pid};
  size_t len = size;
  if (sysctl(mib, 3, buf, &len, NULL, 0) != 0) return -1;
  return (int)len;
}

static int emit_procargs(FILE *out, const char *buf, int len, int try) {
  if (len < (int)sizeof(int)) return -1;
  int argc;
  memcpy(&argc, buf, sizeof(int));
  const char *p = buf + sizeof(int), *end = buf + len;
  const char *exec_path = p;
  size_t exec_len = strnlen(p, (size_t)(end - p));
  p += exec_len;
  while (p < end && *p == '\0') p++;
  fprintf(out, "{\"captured\":true,\"try\":%d,\"execPath\":", try);
  json_string(out, exec_path, exec_len);
  fputs(",\"argv\":[", out);
  for (int i = 0; i < argc && p < end; i++) {
    size_t n = strnlen(p, (size_t)(end - p));
    if (i) fputc(',', out);
    json_string(out, p, n);
    p += n + 1;
  }
  fputs("],\"env\":[", out);
  // The kernel may pad between the last argument and the environment.
  while (p < end && *p == '\0') p++;
  int first = 1;
  while (p < end && *p != '\0') {
    size_t n = strnlen(p, (size_t)(end - p));
    if (!first) fputc(',', out);
    first = 0;
    json_string(out, p, n);
    p += n + 1;
  }
  fputs("]}\n", out);
  return 0;
}

static int exec_path_is(const char *buf, int len, const char *target) {
  size_t room = len > (int)sizeof(int) ? (size_t)len - sizeof(int) : 0;
  size_t n = strlen(target);
  return room > n && memcmp(buf + sizeof(int), target, n + 1) == 0;
}

// A process as found: its pid and start time, so a pid reused after it ended is never mistaken for it.
typedef struct { pid_t pid; uint64_t start_us; } proc_id;
#define TREE_MAX 1024

// -> 1 and the start time and group of a live (not zombie) `pid`; 0 when it is gone, a zombie, or unreadable.
static int live_info(pid_t pid, uint64_t *start_us, pid_t *pgid) {
  struct proc_bsdinfo info;
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, (int)sizeof(info)) != (int)sizeof(info) || info.pbi_status == SZOMB) return 0;
  if (start_us) *start_us = info.pbi_start_tvsec * 1000000 + info.pbi_start_tvusec;
  if (pgid) *pgid = (pid_t)info.pbi_pgid;
  return 1;
}
static int same_process(proc_id p) {
  uint64_t start;
  return live_info(p.pid, &start, NULL) && start == p.start_us;
}
// proc_listchildpids/proc_listpgrppids into a zeroed `pids`; -> how many slots to scan (zero slots are skipped).
#define LIST_MAX 512
static int list_pids(int (*lister)(pid_t, void *, int), pid_t of, pid_t *pids) {
  memset(pids, 0, LIST_MAX * sizeof(pid_t));
  int count = lister(of, pids, LIST_MAX * (int)sizeof(pid_t));
  return count < 0 ? 0 : count > LIST_MAX ? LIST_MAX : count;
}
static void remember(proc_id *tree, int *n, pid_t pid) {
  uint64_t start;
  if (pid <= 0 || !live_info(pid, &start, NULL)) return;
  for (int i = 0; i < *n; i++) if (tree[i].pid == pid && tree[i].start_us == start) return;
  if (*n < TREE_MAX) tree[(*n)++] = (proc_id){pid, start};
}
// Adds the live descendants of `root` (breadth first) and the live members of its process group to `tree`.
static void collect(pid_t root, proc_id *tree, int *n) {
  pid_t kids[LIST_MAX];
  int members = list_pids(proc_listpgrppids, root, kids);
  for (int k = 0; k < members; k++) if (kids[k] != root) remember(tree, n, kids[k]);
  pid_t queue[TREE_MAX];
  int head = 0, tail = 0;
  queue[tail++] = root;
  while (head < tail) {
    int count = list_pids(proc_listchildpids, queue[head++], kids);
    for (int k = 0; k < count; k++) {
      if (kids[k] <= 0) continue;
      remember(tree, n, kids[k]);
      if (tail < TREE_MAX) queue[tail++] = kids[k];
    }
  }
}
// Whether the launcher has exited; it is not reaped (WNOWAIT), so its pid stays reserved until end_attempt reaps it.
static int launcher_exited(pid_t cli) {
  siginfo_t info;
  memset(&info, 0, sizeof(info));
  return waitid(P_PID, (id_t)cli, &info, WEXITED | WNOHANG | WNOWAIT) == 0 && info.si_pid == cli;
}
// Live processes of the attempt: the launcher, any member of its group, any process remembered from its tree.
static int remaining(pid_t cli, proc_id *tree, int n) {
  int left = !launcher_exited(cli);
  pid_t members[LIST_MAX];
  int count = list_pids(proc_listpgrppids, cli, members);
  for (int k = 0; k < count; k++) if (members[k] > 0 && members[k] != cli && live_info(members[k], NULL, NULL)) left++;
  for (int i = 0; i < n; i++) {
    pid_t pgid;
    if (same_process(tree[i]) && live_info(tree[i].pid, NULL, &pgid) && pgid != cli) left++;
  }
  return left;
}

// Ends what is left of an attempt: SIGTERM to its group and to every process of its tree, up to 2 s for them to go,
// then SIGKILL and up to 2 s more; then reaps the launcher. -> the number of its processes still alive (0 normally).
static int end_attempt(pid_t cli) {
  static proc_id tree[TREE_MAX];
  int n = 0;
  const int signals[2] = {SIGTERM, SIGKILL};
  int left = 0;
  for (int round = 0; round < 2; round++) {
    // Found again each round: a process may have forked since; the launcher, unreaped, still roots its group.
    if (!launcher_exited(cli)) collect(cli, tree, &n);
    else {
      pid_t members[LIST_MAX];
      int count = list_pids(proc_listpgrppids, cli, members);
      for (int k = 0; k < count; k++) if (members[k] != cli) remember(tree, &n, members[k]);
    }
    kill(-cli, signals[round]);
    for (int i = 0; i < n; i++) if (same_process(tree[i])) kill(tree[i].pid, signals[round]);
    uint64_t until = now_ms() + 2000;
    while ((left = remaining(cli, tree, n)) > 0 && now_ms() < until) usleep(10000);
    if (!left) break;
  }
  int status;
  if (launcher_exited(cli)) waitpid(cli, &status, 0);
  if (left) fprintf(stderr, "capture-argv: %d process(es) of launcher %d survived SIGKILL\n", left, (int)cli);
  return left;
}

int main(int argc, char **argv) {
  int tries = 20, timeout_ms = 15000;
  const char *target = "/usr/bin/sandbox-exec";
  int i = 1;
  for (; i < argc; i++) {
    if (!strcmp(argv[i], "--tries") && i + 1 < argc) tries = atoi(argv[++i]);
    else if (!strcmp(argv[i], "--timeout-ms") && i + 1 < argc) timeout_ms = atoi(argv[++i]);
    else if (!strcmp(argv[i], "--target") && i + 1 < argc) target = argv[++i];
    else if (!strcmp(argv[i], "--")) { i++; break; }
    else { fprintf(stderr, "capture-argv: unknown argument %s\n", argv[i]); return 2; }
  }
  if (i >= argc || tries < 1) {
    fprintf(stderr, "usage: capture-argv [--tries N] [--timeout-ms N] [--target PATH] -- <launcher> [args...]\n");
    return 2;
  }
  char **command = argv + i;

  int argmax_mib[2] = {CTL_KERN, KERN_ARGMAX}, argmax = 0;
  size_t argmax_len = sizeof(argmax);
  if (sysctl(argmax_mib, 2, &argmax, &argmax_len, NULL, 0) != 0 || argmax <= 0) argmax = 1 << 20;
  char *buf = malloc((size_t)argmax);
  if (!buf) return 2;

  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0);
  posix_spawn_file_actions_addopen(&actions, 1, "/dev/null", O_WRONLY, 0);
  // Each attempt's launcher leads a new process group (its pid is the group's id).
  posix_spawnattr_t attributes;
  posix_spawnattr_init(&attributes);
  posix_spawnattr_setflags(&attributes, POSIX_SPAWN_SETPGROUP);
  posix_spawnattr_setpgroup(&attributes, 0);
  int survivors = 0;

  int attempts_seen[64] = {0};
  for (int t = 1; t <= tries; t++) {
    pid_t cli;
    int rc = posix_spawn(&cli, command[0], &actions, &attributes, command, environ);
    if (rc != 0) { fprintf(stderr, "capture-argv: cannot spawn %s: %s\n", command[0], strerror(rc)); return 2; }
    uint64_t deadline = now_ms() + (uint64_t)timeout_ms;
    pid_t caught = 0;
    int seen = 0, exited = 0;
    while (now_ms() < deadline) {
      pid_t kids[256];
      memset(kids, 0, sizeof(kids));
      proc_listchildpids(cli, kids, (int)sizeof(kids));
      for (size_t k = 0; k < sizeof(kids) / sizeof(kids[0]); k++) {
        if (kids[k] <= 0) continue;
        int len = read_procargs(kids[k], buf, (size_t)argmax);
        if (len <= 0) continue;
        seen = 1;
        if (exec_path_is(buf, len, target)) {
          emit_procargs(stdout, buf, len, t);
          fflush(stdout);
          caught = kids[k];
          break;
        }
      }
      if (caught) break;
      if (launcher_exited(cli)) { exited = 1; break; }
    }
    if (caught) {
      // Let the run finish on its own for a bounded time, then end what is left of it.
      uint64_t grace = now_ms() + 5000;
      while (!exited && now_ms() < grace) {
        if (launcher_exited(cli)) exited = 1;
        else usleep(10000);
      }
      int left = end_attempt(cli);
      free(buf);
      return left ? 3 : 0;
    }
    survivors += end_attempt(cli);
    if (t <= 64) attempts_seen[t - 1] = seen;
  }
  printf("{\"captured\":false,\"tries\":%d,\"attempts\":[", tries);
  for (int t = 0; t < tries && t < 64; t++) printf("%s{\"sawChild\":%s}", t ? "," : "", attempts_seen[t] ? "true" : "false");
  printf("]}\n");
  free(buf);
  return survivors ? 3 : 1;
}
