// Stricter matching: reduce each word to its stem, then to a shared key for common synonyms,
// so "migrating the data" and "migrated the information" fingerprint the same way.
import { stemmer } from "stemmer";

const GROUPS = `
use utilize utilise employ apply
show demonstrate indicate reveal illustrate
important significant crucial vital essential key
method approach technique procedure
result outcome finding
increase rise grow raise boost
decrease reduce decline lower diminish
begin start commence initiate
end finish conclude complete
need require
get obtain acquire gain
make create produce generate build
examine investigate analyse analyze study explore assess evaluate
many numerous multiple various several
quick fast rapid swift
help assist aid support
about approximately roughly around
also additionally furthermore moreover
but however yet
so therefore thus hence consequently
change alter modify adjust
aim goal objective purpose
problem issue challenge difficulty
provide offer supply give
choose select pick
part component element piece
whole entire complete
enough sufficient adequate
try attempt
keep retain maintain preserve
move migrate transfer shift relocate
allow enable permit let
main primary principal chief major
often frequently commonly
area field domain
big large huge substantial
small little minor tiny
because since due
idea concept notion
way manner means
think believe consider
say state claim assert argue
find discover identify detect
check verify confirm validate
data information
tool utility
automatic automated
fully completely entirely totally
careful thorough meticulous
directly straight
equivalent counterpart
setting configuration
manage administer handle
`;

const MAP = new Map<string, string>();
for (const line of GROUPS.trim().split("\n")) {
  const words = line.trim().split(/\s+/).map((w) => stemmer(w));
  for (const w of words) if (!MAP.has(w)) MAP.set(w, words[0]);
}

const memo = new Map<string, string>();

export function canon(word: string): string {
  let c = memo.get(word);
  if (c === undefined) {
    const s = stemmer(word);
    memo.set(word, (c = MAP.get(s) ?? s));
  }
  return c;
}
