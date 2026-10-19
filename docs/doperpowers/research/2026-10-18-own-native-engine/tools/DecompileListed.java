// Decompile the functions named in a list file into one C file each.
//
// Usage (headless, against the already-analysed project; never -import again):
//   support/analyzeHeadless ~/tools/ghidra-projects sky -process SkyComputerUseService -noanalysis \
//       -postScript DecompileListed.java <listFile> <outDir> -scriptPath <this directory>
//
// List file: one entry per line, `#` comments. An entry is a hex address (0x...) or an exact
// symbol name, optionally followed by whitespace and `depth=N` to also decompile the callees
// reachable within N call edges (default 0; thunks, externals and functions already written are
// skipped). Output: <outDir>/<address>_<sanitised name>.c, with a header listing the function's
// name, address, size, callers and callees so the next entries can be chosen from it. Imported
// (library) calls appear in the C body by name; hashed soft-linked calls appear as indirect calls.
//
// Research artefact for SSFSKIM/cua #117 (F-helper-logic.md). Static only: nothing is run.
//@category cua

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.SymbolTable;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class DecompileListed extends GhidraScript {

    private DecompInterface decomp;
    private FunctionManager fm;
    private Set<Address> written = new HashSet<>();
    private PrintWriter index;

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            printerr("usage: DecompileListed <listFile> <outDir>");
            return;
        }
        File listFile = new File(args[0]);
        File outDir = new File(args[1]);
        outDir.mkdirs();
        fm = currentProgram.getFunctionManager();

        decomp = new DecompInterface();
        DecompileOptions opts = new DecompileOptions();
        opts.setMaxPayloadMBytes(64);
        decomp.setOptions(opts);
        decomp.toggleCCode(true);
        decomp.toggleSyntaxTree(false);
        decomp.setSimplificationStyle("decompile");
        if (!decomp.openProgram(currentProgram)) {
            printerr("decompiler failed to open program: " + decomp.getLastMessage());
            return;
        }

        // Remember what earlier runs wrote so depth expansion does not repeat them.
        File[] existing = outDir.listFiles();
        if (existing != null) {
            for (File f : existing) {
                String n = f.getName();
                int us = n.indexOf('_');
                if (n.endsWith(".c") && us > 0) {
                    try {
                        written.add(toAddr(Long.parseUnsignedLong(n.substring(0, us), 16)));
                    } catch (NumberFormatException ignore) {}
                }
            }
        }

        index = new PrintWriter(new FileWriter(new File(outDir, "INDEX.txt"), true));
        try {
            for (String raw : Files.readAllLines(listFile.toPath())) {
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] parts = line.split("\\s+");
                String target = parts[0];
                int depth = 0;
                int next = 0;
                for (int i = 1; i < parts.length; i++) {
                    if (parts[i].startsWith("depth=")) depth = Integer.parseInt(parts[i].substring(6));
                    // `next=N`: also the N functions that follow in address order. Swift async
                    // functions continue in adjacent resume partials reached through the task
                    // scheduler, not direct calls, so the call graph alone misses them.
                    if (parts[i].startsWith("next=")) next = Integer.parseInt(parts[i].substring(5));
                }
                Function f = resolve(target);
                if (f == null) {
                    println("UNRESOLVED " + target);
                    index.println("UNRESOLVED " + target);
                    continue;
                }
                expand(f, depth);
                if (next > 0) {
                    int n = 0;
                    for (Function g : fm.getFunctions(f.getEntryPoint().next(), true)) {
                        if (n++ >= next) break;
                        expand(g, depth);
                    }
                }
            }
        } finally {
            index.close();
            decomp.dispose();
        }
    }

    private Function resolve(String target) {
        if (target.startsWith("0x") || target.startsWith("0X")) {
            Address a = toAddr(Long.parseUnsignedLong(target.substring(2), 16));
            Function f = fm.getFunctionContaining(a);
            if (f == null) f = fm.getFunctionAt(a);
            return f;
        }
        SymbolTable st = currentProgram.getSymbolTable();
        SymbolIterator it = st.getSymbols(target);
        while (it.hasNext()) {
            Symbol s = it.next();
            Function f = fm.getFunctionAt(s.getAddress());
            if (f != null) return f;
        }
        // Fall back to a substring match over function names (slow; only for short lists).
        for (Function f : fm.getFunctions(true)) {
            if (f.getName(true).contains(target)) return f;
        }
        return null;
    }

    private void expand(Function root, int depth) throws Exception {
        Deque<Object[]> queue = new ArrayDeque<>();
        queue.add(new Object[] { root, depth });
        while (!queue.isEmpty()) {
            Object[] item = queue.poll();
            Function f = (Function) item[0];
            int d = (Integer) item[1];
            if (f.isThunk() || f.isExternal()) continue;
            Address entry = f.getEntryPoint();
            boolean fresh = !written.contains(entry);
            if (fresh) {
                written.add(entry);
                writeOne(f);
            }
            if (d > 0) {
                for (Function callee : f.getCalledFunctions(monitor)) {
                    if (callee.isThunk()) {
                        Function thunked = callee.getThunkedFunction(true);
                        if (thunked != null) callee = thunked;
                    }
                    if (callee.isExternal()) continue;
                    if (!written.contains(callee.getEntryPoint())) {
                        queue.add(new Object[] { callee, d - 1 });
                    }
                }
            }
        }
    }

    private void writeOne(Function f) throws Exception {
        String name = f.getName(true);
        String addr = f.getEntryPoint().toString();
        String fileName = addr + "_" + sanitise(name) + ".c";
        File out = new File(indexDir(), fileName);
        monitor.setMessage("decompiling " + name);
        DecompileResults res = decomp.decompileFunction(f, 120, monitor);
        try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
            w.println("// function: " + name);
            w.println("// address: " + addr + "  size: " + f.getBody().getNumAddresses());
            w.println("// signature: " + f.getSignature().getPrototypeString());
            List<String> callers = new ArrayList<>();
            for (Function c : f.getCallingFunctions(monitor)) callers.add(c.getEntryPoint() + " " + c.getName(true));
            List<String> callees = new ArrayList<>();
            for (Function c : f.getCalledFunctions(monitor)) {
                Function t = c.isThunk() ? c.getThunkedFunction(true) : c;
                callees.add(c.getEntryPoint() + " " + (t != null ? t.getName(true) : c.getName(true)));
            }
            w.println("// callers (" + callers.size() + "):");
            for (String s : callers) w.println("//   " + s);
            w.println("// callees (" + callees.size() + "):");
            for (String s : callees) w.println("//   " + s);
            w.println();
            if (res == null || !res.decompileCompleted()) {
                w.println("// DECOMPILE FAILED: " + (res == null ? "null" : res.getErrorMessage()));
            } else {
                w.print(res.getDecompiledFunction().getC());
            }
        }
        index.println(addr + " " + fileName + " " + name);
        index.flush();
        println("wrote " + fileName);
    }

    private File indexDirCache;
    private File indexDir() {
        if (indexDirCache == null) {
            indexDirCache = new File(getScriptArgs()[1]).getAbsoluteFile();
        }
        return indexDirCache;
    }

    private static String sanitise(String name) {
        String s = name.replaceAll("[^A-Za-z0-9_.]+", "_");
        if (s.length() > 120) s = s.substring(0, 120);
        return s;
    }
}
