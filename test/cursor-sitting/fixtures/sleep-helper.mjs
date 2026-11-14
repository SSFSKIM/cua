// A stand-in for `cua engine stop` in the signal tests: it prints STARTED, sleeps argv[2] ms and exits 0. A signal that
// reaches it kills it (Node's default), so its exit says whether it was in the signalled process group.
process.stdout.write('STARTED\n');
setTimeout(() => process.exit(0), Number(process.argv[2] ?? 300));
