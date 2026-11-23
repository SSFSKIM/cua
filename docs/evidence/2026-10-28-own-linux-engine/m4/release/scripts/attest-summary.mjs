// task 80: the fields of each `gh attestation verify --format json` output that the release README records.
//   usage: node attest-summary.mjs <attestation.json>...
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';

for (const file of process.argv.slice(2)) {
  for (const a of JSON.parse(readFileSync(file, 'utf8'))) {
    const s = a.verificationResult.statement, p = s.predicate, cert = a.verificationResult.signature.certificate;
    console.log(JSON.stringify({file: basename(file), predicate: s.predicateType,
      subjects: s.subject.map(t => `${t.name} ${t.digest.sha256}`),
      source_commit: cert.sourceRepositoryDigest, source_ref: cert.sourceRepositoryRef,
      signer: cert.buildSignerURI, run: p.runDetails?.metadata?.invocationId, runner: cert.runnerEnvironment}, null, 1));
  }
}
