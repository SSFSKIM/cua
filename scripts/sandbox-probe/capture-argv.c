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
// object {captured: true, try, execPath, argv, env} on stdout, waits for the launcher (bounded), then stops what is
// left of the run (the launcher and the caught child, by pid; nothing else). Without a catch after every try it prints
// {captured: false, tries, attempts} and exits 1. --target (default /usr/bin/sandbox-exec) is the exec path to catch.
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

static void stop(pid_t pid) {
  if (pid > 0) kill(pid, SIGTERM);
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

  int attempts_seen[64] = {0};
  for (int t = 1; t <= tries; t++) {
    pid_t cli;
    int rc = posix_spawn(&cli, command[0], &actions, NULL, command, environ);
    if (rc != 0) { fprintf(stderr, "capture-argv: cannot spawn %s: %s\n", command[0], strerror(rc)); return 2; }
    uint64_t deadline = now_ms() + (uint64_t)timeout_ms;
    pid_t caught = 0;
    int seen = 0, status = 0, exited = 0;
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
      pid_t w = waitpid(cli, &status, WNOHANG);
      if (w == cli) { exited = 1; break; }
    }
    if (caught) {
      // Let the run finish on its own for a bounded time, then stop what is left of it.
      uint64_t grace = now_ms() + 5000;
      while (!exited && now_ms() < grace) {
        if (waitpid(cli, &status, WNOHANG) == cli) exited = 1;
        else usleep(10000);
      }
      // The launcher waits for its child, so a launcher that exited leaves nothing; otherwise stop both by pid.
      if (!exited) { stop(caught); stop(cli); waitpid(cli, &status, 0); }
      free(buf);
      return 0;
    }
    if (!exited) { stop(cli); waitpid(cli, &status, 0); }
    if (t <= 64) attempts_seen[t - 1] = seen;
  }
  printf("{\"captured\":false,\"tries\":%d,\"attempts\":[", tries);
  for (int t = 0; t < tries && t < 64; t++) printf("%s{\"sawChild\":%s}", t ? "," : "", attempts_seen[t] ? "true" : "false");
  printf("]}\n");
  free(buf);
  return 1;
}
