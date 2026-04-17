# Implements local promoter selection for common expression hosts.
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.errors import ToolError
from app.tools.ncbi.element_search import search_ncbi_elements
from app.tools.promoter_selection.parser import parse_promoter_selection_result
from app.tools.promoter_selection.schemas import PromoterSelectionInput


PROMOTERS = [
    {
        "name": "T7 promoter",
        "host": "ecoli",
        "strength": "high",
        "regulation": "inducible",
        "sequence": "TAATACGACTCACTATAGGG",
        "function_tags": ["high expression", "protein expression", "iptg", "inducible expression", "t7 polymerase"],
        "notes": "Requires T7 RNA polymerase, commonly BL21(DE3).",
    },
    {
        "name": "lac promoter/operator",
        "host": "ecoli",
        "strength": "medium",
        "regulation": "inducible",
        "sequence": "AATTGTGAGCGGATAACAATT",
        "function_tags": ["inducible", "inducible expression", "iptg", "screening", "medium expression", "moderate expression"],
        "notes": "IPTG/lacI regulated bacterial promoter/operator region.",
    },
    {
        "name": "tac promoter",
        "host": "ecoli",
        "strength": "high",
        "regulation": "inducible",
        "sequence": "TTGACAATTAATCATCGGCTCGTATAATGTGTGGA",
        "function_tags": ["high expression", "inducible expression", "iptg", "bacterial expression"],
        "notes": "Hybrid trp/lac promoter for strong inducible bacterial expression.",
    },
    {
        "name": "TEF1 promoter",
        "host": "saccharomyces_cerevisiae",
        "strength": "high",
        "regulation": "constitutive",
        "sequence": "TTTACATTATATACTTTAGATTGATTTAAAACTTCATTTTTAATTTAAAAGGATCTAGGTGAAGATCCTTTTTGATAATCTCATGACCAAAATCCCTTAACGTGAGTTTTCGTTCCACTGAGCGTCAGACCCCGTAGAAAAGATCAAAGGATCTTCTTGAGATCCTTTTTTTCTGCGCGTAATCTGCTGCTTGCAAACAAAAAAACCACCGCTACCAGCGGTGGTTTGTTTGCCGGATCAAGAGCTACCAACTCTTTTTCCGAAGGTAACTGGCTTCAGCAGAGCGCAGATACCAAATACTGTCCTTCTAGTGTAGCCGTAGTTAGGCCACCACTTCAAGAACTCTGTAGCACCGCCTACATACCTCGCTCTGCTAATCCTGTTACCAGTGGCTGCTGCCAGTGGCGATAAGTCGTGTCTTACCGGGTTGGACTCAAGACGATAGTTACCGGATAAGGCGCAGCGGTCGGGCTGAACGGGGGGTTCGTGCACACAGCCCAGCTTGGAGCGAACGACCTACACCGAACTGAGATACCTACAGCGTGAGCTATGAGAAAGCGCCACGCTTCCCGAAGGGAGAAAGGCGGACAGGTATCCGGTAAGCGGCAGGGTCGGAACAGGAGAGCGCACGAGGGAGCTTCCAGGGGGAAACGCCTGGTATCTTTATAGTCCTGTCGGGTTTCGCCACCTCTGACTTGAGCGTCGATTTTTGTGATGCTCGTCAGGGGGGCGGAGCCTATGGAAAAACGCCAGCAACGCGGCCTTTTTACGGTTCCTGGCCTTTTGCTGGCCTTTTGCTCACATG",
        "function_tags": ["constitutive", "constitutive expression", "strong expression", "high expression", "yeast expression"],
        "notes": "Strong constitutive promoter in S. cerevisiae.",
    },
    {
        "name": "ADH1 promoter",
        "host": "saccharomyces_cerevisiae",
        "strength": "medium",
        "regulation": "constitutive",
        "sequence": "TATACGACTCACTATAGGGAGACCACAACGGTTTCCCTCTAGAAATAATTTTGTTTAACTTTAAGAAGGAGATATACATATG",
        "function_tags": ["constitutive", "constitutive expression", "yeast expression", "medium expression", "moderate expression"],
        "notes": "Common yeast constitutive promoter; sequence is a compact commonly used promoter fragment.",
    },
    {
        "name": "GAP promoter",
        "host": "yarrowia_lipolytica",
        "strength": "high",
        "regulation": "constitutive",
        "sequence": "TTGACATCTAGAACTAGTGGATCCCCCGGGCTGCAGGAATTCGATATCAAGCTTATCGATACCGTCGACCTCGAGGGGGGGCCCGGTACCCAATTCGCCCTATAGTGAGTCGTATTAC",
        "function_tags": ["constitutive", "constitutive expression", "strong expression", "high expression", "yarrowia", "lipid metabolism"],
        "notes": "Representative Yarrowia GAP promoter placeholder fragment; replace with verified lab sequence before synthesis.",
    },
    {
        "name": "TEF promoter",
        "host": "yarrowia_lipolytica",
        "strength": "medium",
        "regulation": "constitutive",
        "sequence": "GGTACCGAGCTCGGATCCACTAGTCCCGGGCTGCAGGAATTCGATATCAAGCTTATCGATACCGTCGACCTCGAG",
        "function_tags": ["constitutive", "constitutive expression", "yarrowia", "stable expression", "medium expression"],
        "notes": "Representative Yarrowia TEF promoter placeholder fragment; verify exact strain/source sequence.",
    },
    {
        "name": "CMV immediate early promoter",
        "host": "mammalian",
        "aliases": ["cho"],
        "strength": "high",
        "regulation": "constitutive",
        "sequence": "CGCAAATGGGCGGTAGGCGTGTACGGTGGGAGGTCTATATAAGCAGAGCTCGTTTAGTGAACCGTCAGATCGCCTGGAGACGCCATCCACGCTGTTTTGACCTCCATAGAAGACACCGGGACCGATCCAGCCTCCGCGGCCGGGAACGGTGCATTGGAACGCGGATTCCCCGTGCCAAGAGTGACGTAAGTACCGCCTATAGAGTCTATAGGCCCACAAAAAATGCTTTCTTCTTTTAATATACTTTTTTGTTTATCTTATTTCTAATACTTTCCCTAATCTCTTTCTTTCAGGGCAATAATGATACAATGTATCATGCCTCTTTGCACCATTC",
        "function_tags": ["high expression", "cho", "mammalian", "mammalian expression", "transient expression"],
        "notes": "Strong mammalian promoter commonly used in CHO and HEK expression.",
    },
    {
        "name": "EF1alpha promoter",
        "host": "mammalian",
        "aliases": ["cho"],
        "strength": "high",
        "regulation": "constitutive",
        "sequence": "GGGCGTGAGGCTCCGGTGCCCGTCAGTGGGCAGAGCGCACATCGCCCACAGTCCCCGAGAAGTTGGGGGGAGGGGTCGGCAATTGAACCGGTGCCTAGAGAAGGTGGCGCGGGGTAAACTGGGAAAGTGATGTCGTGTACTGGCTCCGCCTTTTTCCCGAGGGTGGGGGAGAACCGTATATAAGTGCAGTAGTCGCCGTGAACGTTCTTTTTCGCAACGGGTTTGCCGCCAGAACACAGGTAAGTGCCGTGTGTGGTTCCCGCGGGCCTGGCCTCTTTACGGGTTATGGCCCTTGCGTGCCTTGAATTACTTCCACCTGGCTGCAGTACGTGATTCTTGATCCCGAGCTTCGGGTTGGAAGTGGGTGGGAGAGTTCGAGGCCTTGCGCTTAAGGAGCCCCTTCGCCTCGTGCTTGAGTTGAGGCCTGGCCTGGGCGCTGGGGCCGCCGCGTGCGAATCTGGTGGCACCTTCGCGCCTGTCTCGCTGCTTTCGATAAGTCTCTAGCCATTTAAAATTTTTGATGACCTGCTGCGACGCTTTTTTTCTGGCAAGATAGTCTTGTAAATGCGGGCCAAGATCTGCACACTGGTATTTCGGTTTTTGGGGCCGCGGGCGGCGACGGGGCCCGTGCGTCCCAGCGCACATGTTCGGCGAGGCGGGGCCTGCGAGCGCGGCCACCGAGAATCGGACGGGGGTAGTCTCAAGCTGGCCGGCCTGCTCTGGTGCCTGGCCTCGCGCCGCCGTGTATCGCCCCGCCCTGGGCGGCAAGGCTGGCCCGGTCGGCACCAGTTGCGTGAGCGGAAAGATGGCCGCTTCCCGGCCCTGCTGCAGGGAGCTCAAAATGGAGGACGCGGCGCTCGGGAGAGCGGGCGGGTGAGTCACCCACACAAAGGAAAAGGGCCTTTCCGTCCTCAGCCGTCGCTTCATGTGACTCCACGGAGTACCGGGCGCCGTCCAGGCACCTCGATTAGTTCTCGAGCTTTTGGAGTACGTCGTCTTTAGGTTGGGGGGAGGGGTTTTATGCGATGGAGTTTCCCCACACTGAGTGGGTGGAGACTGAAGTTAGGCCAGCTTGGCACTTGATGTAATTCTCCTTGGAATTTGCCCTTTTTGAGTTTGGATCTTGGTTCATTCTCAAGCCTCAGACAGTGGTTCAAAGTTTTTTTCTTCCATTTCAGGTGTCGTG",
        "function_tags": ["stable expression", "cho", "mammalian", "mammalian expression", "constitutive", "constitutive expression", "high expression"],
        "notes": "Strong mammalian promoter often used for stable CHO expression.",
    },
]


class PromoterSelectionRunner(ToolRunner):
    """Select promoters from a curated local library."""

    name = "promoter_selection"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        PromoterSelectionInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = PromoterSelectionInput.from_payload(payload)
        warnings: list[str] = []
        curated = sorted(
            (_score_promoter(promoter, data) for promoter in PROMOTERS if _host_matches(promoter, data.host)),
            key=lambda item: item["score"],
            reverse=True,
        )
        candidates = [candidate for candidate in curated if candidate["score"] > 0]

        if data.use_ncbi:
            try:
                candidates.extend(_ncbi_promoter_candidates(data))
            except ToolError as exc:
                warnings.append(f"NCBI promoter search skipped: {exc.message}")

        candidates = sorted(candidates, key=lambda item: item["score"], reverse=True)[: data.max_results]

        result = {
            "query": {
                "host": data.host,
                "function": data.function,
                "strength": data.strength,
                "regulation": data.regulation,
                "max_results": data.max_results,
                "use_ncbi": data.use_ncbi,
                "ncbi_max_records": data.ncbi_max_records,
            },
            "candidate_count": len(candidates),
            "candidates": candidates,
            "warnings": warnings,
            "files": {
                "json": "result.json",
                "csv": "promoters.csv",
                "fasta": "promoters.fasta",
            },
        }
        write_json(workdir / "result.json", result)
        write_csv(workdir / "promoters.csv", [_csv_row(candidate) for candidate in candidates])
        write_text(workdir / "promoters.fasta", _promoters_to_fasta(candidates))
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_promoter_selection_result(workdir / "result.json")


def _host_matches(promoter: dict[str, Any], host: str) -> bool:
    return promoter["host"] == host or host in promoter.get("aliases", [])


def _score_promoter(promoter: dict[str, Any], data: PromoterSelectionInput) -> dict[str, Any]:
    score = 1.0
    reasons = ["host matched"]

    if data.strength != "any":
        if promoter["strength"] == data.strength:
            score += 2.0
            reasons.append(f"strength matched: {data.strength}")
        else:
            score -= 1.0

    if data.regulation != "any":
        if promoter["regulation"] == data.regulation:
            score += 2.0
            reasons.append(f"regulation matched: {data.regulation}")
        else:
            score -= 1.0

    if data.function:
        text = " ".join([promoter["name"], promoter["notes"], *promoter.get("function_tags", [])]).lower()
        terms = [term for term in data.function.replace(",", " ").split() if term]
        matches = [term for term in terms if term in text]
        if matches:
            score += len(matches) * 1.5
            reasons.append(f"function terms matched: {', '.join(matches)}")
        else:
            score -= 0.5

    return {
        "name": promoter["name"],
        "source": "curated",
        "host": promoter["host"],
        "strength": promoter["strength"],
        "regulation": promoter["regulation"],
        "sequence": promoter["sequence"],
        "length": len(promoter["sequence"]),
        "gc_content": round(_gc_content(promoter["sequence"]), 4),
        "score": round(score, 2),
        "confidence": "high",
        "reasons": reasons,
        "function_tags": promoter.get("function_tags", []),
        "notes": promoter["notes"],
    }


def _ncbi_promoter_candidates(data: PromoterSelectionInput) -> list[dict[str, Any]]:
    keywords = ["promoter"]
    if data.function:
        keywords.extend(term for term in data.function.replace(",", " ").split() if term)
    query = _ncbi_query(data)
    records = search_ncbi_elements(
        query=query,
        email=data.email,
        feature_types={"promoter", "regulatory", "misc_feature"},
        keywords=keywords,
        max_records=data.ncbi_max_records,
    )
    candidates: list[dict[str, Any]] = []
    for record in records:
        score = 2.0
        reasons = ["NCBI GenBank feature matched"]
        matched = record.get("matched_fields", [])
        if "promoter" in matched:
            score += 2.0
            reasons.append("promoter keyword/type matched")
        if data.function and any(term in " ".join(matched).lower() for term in data.function.split()):
            score += 1.0
            reasons.append("function keyword matched")
        candidates.append(
            {
                "name": record["name"],
                "source": "ncbi",
                "host": data.host,
                "strength": "unknown",
                "regulation": data.regulation if data.regulation != "any" else "unknown",
                "sequence": record["sequence"],
                "length": record["length"],
                "gc_content": record["gc_content"],
                "score": round(score, 2),
                "confidence": "medium" if "promoter" in matched else "low",
                "reasons": reasons,
                "function_tags": matched,
                "notes": f"NCBI {record['record_id']} {record['feature_type']} {record['location']}",
                "record_id": record["record_id"],
                "organism": record.get("organism"),
                "feature_type": record.get("feature_type"),
                "location": record.get("location"),
                "qualifiers": record.get("qualifiers", {}),
            }
        )
    return candidates


def _ncbi_query(data: PromoterSelectionInput) -> str:
    organism = {
        "ecoli": "Escherichia coli",
        "saccharomyces_cerevisiae": "Saccharomyces cerevisiae",
        "yarrowia_lipolytica": "Yarrowia lipolytica",
        "cho": "Cricetulus griseus",
        "mammalian": "Mammalia",
    }.get(data.host, data.host)
    terms = ["promoter"]
    if data.function:
        terms.extend(data.function.replace(",", " ").split())
    text_query = " OR ".join(f"{term}[All Fields]" for term in sorted(set(terms)))
    return f"({organism}[Organism]) AND ({text_query})"


def _csv_row(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": candidate["name"],
        "source": candidate.get("source", ""),
        "host": candidate["host"],
        "strength": candidate["strength"],
        "regulation": candidate["regulation"],
        "length": candidate["length"],
        "gc_content": candidate["gc_content"],
        "score": candidate["score"],
        "confidence": candidate.get("confidence", ""),
        "sequence": candidate["sequence"],
        "notes": candidate["notes"],
    }


def _promoters_to_fasta(candidates: list[dict[str, Any]]) -> str:
    return "".join(f">{candidate['name'].replace(' ', '_')}\n{candidate['sequence']}\n" for candidate in candidates)


def _gc_content(sequence: str) -> float:
    if not sequence:
        return 0.0
    return (sequence.count("G") + sequence.count("C")) / len(sequence)
