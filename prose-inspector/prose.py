"""Writing-pattern analysis: sentence rhythm, stock phrases and repetition.

Analysis only. It reports where a draft is monotonous or leans on stock phrasing; the author decides
what to change and makes the edits.
"""
from __future__ import annotations

import re
import statistics
from collections import Counter
from dataclasses import dataclass, field

DEFAULT_PATTERNS: dict[str, list[str]] = {
    "Stock transitions": [
        "furthermore", "moreover", "additionally", "consequently", "in conclusion", "in summary",
        "to sum up", "nevertheless", "thus", "hence", "first and foremost", "last but not least",
    ],
    "Fillers": [
        "it is important to note", "it's worth noting", "it is worth noting", "needless to say", "in order to",
        "due to the fact that", "at the end of the day", "the fact that", "basically", "essentially",
        "actually", "really", "very", "quite", "a wide range of", "various",
    ],
    "Clichés and buzzwords": [
        "delve", "tapestry", "testament to", "realm", "beacon", "shed light", "navigate the complexities",
        "ever-evolving", "fast-paced world", "landscape", "plays a crucial role", "pivotal", "unlock the potential",
        "seamless", "robust", "leverage", "synergy", "game-changer", "cutting-edge", "paradigm shift", "holistic",
    ],
    "Run-ups": [
        "in today's world", "in today's fast-paced world", "when it comes to", "it goes without saying",
        "one of the most", "there is no doubt that", "it can be argued that", "in this essay i will",
        "this essay will", "as we all know",
    ],
}

STOP = set("""a about above after again against all am an and any are as at be because been before being below between
both but by can could did do does doing down during each few for from further had has have having he her here hers
herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only
or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then
there these they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours yourself also may might must shall us via within without upon one two three many much
however thus etc s t""".split())

WORD = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)?")
ABBREV = re.compile(r"\b(?:e\.g|i\.e|etc|vs|cf|al|approx|Dr|Mr|Mrs|Ms|Prof|Fig|No|St|Jr|Sr)\.", re.I)
SENT_END = re.compile(r"(?<=[.!?])[\"'”’)\]]*\s+(?=[\"'“‘(\[]?[A-Z0-9])")


@dataclass
class Sentence:
    text: str
    start: int  # character offset in the full text
    para: int  # paragraph number, from 1
    words: int


@dataclass
class Report:
    sentences: list[Sentence]
    paragraphs: list[dict]
    overall: dict
    hits: list[dict]  # stock-phrase matches
    top_words: list[tuple[str, int]]
    top_phrases: list[tuple[str, int]]
    close_repeats: list[dict]
    long_sentences: list[Sentence] = field(default_factory=list)
    uniform_paragraphs: list[dict] = field(default_factory=list)


def words_of(text: str) -> list[str]:
    return [w.lower().replace("’", "'") for w in WORD.findall(text)]


def split_sentences(text: str) -> list[Sentence]:
    """Sentences with offsets, keeping abbreviations such as "e.g." and "Dr." intact."""
    out: list[Sentence] = []
    para_starts = [0] + [m.end() for m in re.finditer(r"\n\s*\n", text)]
    masked = ABBREV.sub(lambda m: m.group(0).replace(".", "\0"), text)
    for block in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]+)*", masked):  # paragraphs, then sentences inside them
        pos = block.start()
        for piece in SENT_END.split(block.group(0)):
            start = masked.index(piece, pos)
            pos = start + len(piece)
            s = piece.replace("\0", ".").strip()
            n = len(WORD.findall(s))
            if n:
                para = sum(1 for p in para_starts if p <= start)
                out.append(Sentence(s, start, para, n))
    return out


def stats(lengths: list[int]) -> dict:
    if not lengths:
        return {"sentences": 0, "mean": 0.0, "sd": 0.0, "cv": 0.0, "min": 0, "max": 0}
    mean = statistics.mean(lengths)
    sd = statistics.pstdev(lengths)
    return {"sentences": len(lengths), "mean": round(mean, 1), "sd": round(sd, 1),
            "cv": round(sd / mean, 2) if mean else 0.0, "min": min(lengths), "max": max(lengths)}


def find_patterns(text: str, sentences: list[Sentence], patterns: dict[str, list[str]]) -> list[dict]:
    """Every occurrence of every configured phrase, matched as whole words, case-insensitive."""
    hits = []
    for category, phrases in patterns.items():
        for phrase in {p.strip().lower() for p in phrases if p.strip()}:
            rx = re.compile(r"(?<![\w'’])" + r"\s+".join(map(re.escape, phrase.split())) + r"(?![\w'’])", re.I)
            for m in rx.finditer(text):
                sent = next((i for i, s in reversed(list(enumerate(sentences))) if s.start <= m.start()), 0)
                hits.append({"category": category, "phrase": phrase, "start": m.start(), "end": m.end(),
                             "sentence": sent + 1, "para": sentences[sent].para if sentences else 1})
    return sorted(hits, key=lambda h: h["start"])


def analyze(text: str, patterns: dict[str, list[str]] | None = None, long_words: int = 35,
            uniform_cv: float = 0.25, close_window: int = 2) -> Report:
    text = text.replace("\r\n", "\n")
    sentences = split_sentences(text)
    lengths = [s.words for s in sentences]

    paragraphs = []
    for p in sorted({s.para for s in sentences}):
        ps = [s for s in sentences if s.para == p]
        paragraphs.append({"para": p, **stats([s.words for s in ps]), "first": ps[0].text[:80]})
    uniform = [p for p in paragraphs if p["sentences"] >= 4 and p["cv"] < uniform_cv]

    words = [w for w in words_of(text)]
    content = [w for w in words if w not in STOP and len(w) > 2 and not w.isdigit()]
    top_words = [(w, c) for w, c in Counter(content).most_common(15) if c >= 3]

    grams = Counter()
    for s in sentences:
        ws = words_of(s.text)
        for n in (2, 3):
            for i in range(len(ws) - n + 1):
                g = ws[i:i + n]
                if sum(w not in STOP for w in g) >= 2:  # skip "of the", "in a"
                    grams[" ".join(g)] += 1
    top_phrases = [(g, c) for g, c in grams.most_common(15) if c >= 2]

    close = []
    for i, s in enumerate(sentences):  # the same content word again within a sentence or two
        here = {w for w in words_of(s.text) if w not in STOP and len(w) > 3}
        for j in range(max(0, i - close_window), i):
            for w in sorted(here & {w for w in words_of(sentences[j].text) if w not in STOP and len(w) > 3}):
                close.append({"word": w, "sentences": (j + 1, i + 1)})

    return Report(
        sentences=sentences, paragraphs=paragraphs, overall=stats(lengths),
        hits=find_patterns(text, sentences, patterns or DEFAULT_PATTERNS),
        top_words=top_words, top_phrases=top_phrases, close_repeats=close,
        long_sentences=[s for s in sentences if s.words > long_words],
        uniform_paragraphs=uniform,
    )


if __name__ == "__main__":
    sample = (
        "Furthermore, it is important to note that the system works well, e.g. under heavy load. "
        "The system scales. Dr. Smith tested it. Moreover, the system doesn't delve into realms it can't handle.\n\n"
        "The team ran the test. The team saw the result. The team wrote the note. The team sent the file.\n\n"
        "In conclusion, the cutting-edge platform delivers."
    )
    r = analyze(sample)
    assert [s.para for s in r.sentences] == [1, 1, 1, 1, 2, 2, 2, 2, 3], [s.para for s in r.sentences]
    assert r.sentences[0].text.endswith("heavy load."), r.sentences[0].text  # "e.g." kept inside
    assert r.sentences[2].text == "Dr. Smith tested it."
    found = {h["phrase"] for h in r.hits}
    assert {"furthermore", "it is important to note", "moreover", "delve", "in conclusion", "cutting-edge"} <= found, found
    assert "realm" not in found  # "realms" is a different word
    assert [p["para"] for p in r.uniform_paragraphs] == [2]  # four 5-word sentences in a row
    assert ("team", 4) in r.top_words and ("system", 3) in r.top_words
    assert ("the team", 4) not in r.top_phrases  # one content word only: not a phrase worth reporting
    assert any(c["word"] == "team" for c in r.close_repeats)
    assert "t" not in dict(r.top_words) and all("'" not in w or w in ("doesn't", "can't") for w, _ in r.top_words)
    assert analyze("").overall["sentences"] == 0
    hit = r.hits[0]
    assert sample[hit["start"]:hit["end"]].lower() == hit["phrase"]
    print("self-check passed:", r.overall, f"{len(r.hits)} phrase hits")
