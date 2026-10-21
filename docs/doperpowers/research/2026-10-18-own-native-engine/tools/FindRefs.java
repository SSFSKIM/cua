// Print every reference to the listed addresses (data or code), with the referencing function.
// Usage: analyzeHeadless <projectDir> sky -process SkyComputerUseService -noanalysis \
//            -postScript FindRefs.java <listFile> <outFile> -scriptPath <this directory>
// List file: one hex address (0x...) per line, `#` comments. Used to find which module owns a
// SoftLink salt or request table (F §11). Static only.
//@category cua

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.nio.file.Files;

public class FindRefs extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        try (PrintWriter w = new PrintWriter(new FileWriter(new File(args[1])))) {
            for (String raw : Files.readAllLines(new File(args[0]).toPath())) {
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                Address a = toAddr(Long.parseUnsignedLong(line.substring(2), 16));
                ReferenceIterator it = currentProgram.getReferenceManager().getReferencesTo(a);
                int n = 0;
                while (it.hasNext()) {
                    Reference r = it.next();
                    Function f = currentProgram.getFunctionManager().getFunctionContaining(r.getFromAddress());
                    w.println(line + " <- " + r.getFromAddress() + " " + r.getReferenceType()
                            + " in " + (f == null ? "?" : f.getEntryPoint() + " " + f.getName(true)));
                    n++;
                }
                if (n == 0) w.println(line + " <- (no references)");
            }
        }
    }
}
