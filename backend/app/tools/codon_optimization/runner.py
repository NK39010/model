# Implements host-specific codon optimization with transparent local heuristics.
from __future__ import annotations

from collections import Counter
from math import exp, log
from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.codon_optimization.parser import parse_codon_optimization_result
from app.tools.codon_optimization.schemas import CodonOptimizationInput
from app.tools.errors import ToolInputError


GENETIC_CODE = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
    "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}

AA_TO_CODONS: dict[str, list[str]] = {}
for codon, aa in GENETIC_CODE.items():
    AA_TO_CODONS.setdefault(aa, []).append(codon)


HOST_PREFERENCES = {
    "ecoli": {
        "A": ["GCG", "GCT", "GCC", "GCA"], "C": ["TGC", "TGT"], "D": ["GAT", "GAC"],
        "E": ["GAA", "GAG"], "F": ["TTC", "TTT"], "G": ["GGC", "GGT", "GGG", "GGA"],
        "H": ["CAC", "CAT"], "I": ["ATT", "ATC", "ATA"], "K": ["AAA", "AAG"],
        "L": ["CTG", "TTG", "CTT", "CTC", "TTA", "CTA"], "M": ["ATG"],
        "N": ["AAC", "AAT"], "P": ["CCG", "CCT", "CCA", "CCC"], "Q": ["CAG", "CAA"],
        "R": ["CGT", "CGC", "CGG", "CGA", "AGA", "AGG"], "S": ["AGC", "TCC", "TCT", "TCG", "TCA", "AGT"],
        "T": ["ACC", "ACT", "ACG", "ACA"], "V": ["GTG", "GTT", "GTC", "GTA"],
        "W": ["TGG"], "Y": ["TAC", "TAT"], "*": ["TAA", "TGA", "TAG"],
    },
    "saccharomyces_cerevisiae": {
        "A": ["GCT", "GCC", "GCA", "GCG"], "C": ["TGT", "TGC"], "D": ["GAT", "GAC"],
        "E": ["GAA", "GAG"], "F": ["TTT", "TTC"], "G": ["GGT", "GGA", "GGC", "GGG"],
        "H": ["CAT", "CAC"], "I": ["ATT", "ATC", "ATA"], "K": ["AAA", "AAG"],
        "L": ["TTG", "TTA", "CTT", "CTC", "CTA", "CTG"], "M": ["ATG"],
        "N": ["AAT", "AAC"], "P": ["CCA", "CCT", "CCC", "CCG"], "Q": ["CAA", "CAG"],
        "R": ["AGA", "AGG", "CGT", "CGA", "CGC", "CGG"], "S": ["TCT", "TCC", "AGT", "TCA", "AGC", "TCG"],
        "T": ["ACT", "ACC", "ACA", "ACG"], "V": ["GTT", "GTC", "GTA", "GTG"],
        "W": ["TGG"], "Y": ["TAT", "TAC"], "*": ["TAA", "TGA", "TAG"],
    },
    "yarrowia_lipolytica": {
        "A": ["GCC", "GCT", "GCA", "GCG"], "C": ["TGC", "TGT"], "D": ["GAC", "GAT"],
        "E": ["GAG", "GAA"], "F": ["TTC", "TTT"], "G": ["GGC", "GGT", "GGA", "GGG"],
        "H": ["CAC", "CAT"], "I": ["ATC", "ATT", "ATA"], "K": ["AAG", "AAA"],
        "L": ["CTG", "CTC", "TTG", "CTT", "TTA", "CTA"], "M": ["ATG"],
        "N": ["AAC", "AAT"], "P": ["CCC", "CCA", "CCT", "CCG"], "Q": ["CAG", "CAA"],
        "R": ["CGC", "CGT", "AGA", "CGG", "CGA", "AGG"], "S": ["TCC", "TCT", "AGC", "TCA", "TCG", "AGT"],
        "T": ["ACC", "ACT", "ACA", "ACG"], "V": ["GTC", "GTG", "GTT", "GTA"],
        "W": ["TGG"], "Y": ["TAC", "TAT"], "*": ["TAA", "TGA", "TAG"],
    },
    "cho": {
        "A": ["GCC", "GCT", "GCA", "GCG"], "C": ["TGC", "TGT"], "D": ["GAC", "GAT"],
        "E": ["GAG", "GAA"], "F": ["TTC", "TTT"], "G": ["GGC", "GGA", "GGT", "GGG"],
        "H": ["CAC", "CAT"], "I": ["ATC", "ATT", "ATA"], "K": ["AAG", "AAA"],
        "L": ["CTG", "CTC", "CTG", "TTG", "CTT", "TTA"], "M": ["ATG"],
        "N": ["AAC", "AAT"], "P": ["CCC", "CCT", "CCA", "CCG"], "Q": ["CAG", "CAA"],
        "R": ["CGC", "CGG", "AGA", "CGT", "AGG", "CGA"], "S": ["AGC", "TCC", "TCT", "TCA", "TCG", "AGT"],
        "T": ["ACC", "ACA", "ACT", "ACG"], "V": ["GTG", "GTC", "GTT", "GTA"],
        "W": ["TGG"], "Y": ["TAC", "TAT"], "*": ["TGA", "TAA", "TAG"],
    },
}


class CodonOptimizationRunner(ToolRunner):
    """Optimize CDS sequences for a target expression host."""

    name = "codon_optimization"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        CodonOptimizationInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = CodonOptimizationInput.from_payload(payload)
        protein = translate_cds(data.sequence) if data.input_type == "cds" else data.sequence
        if "*" in protein[:-1]:
            raise ToolInputError("Input CDS contains an internal stop codon.")
        protein = protein.rstrip("*")

        optimized_codons = optimize_protein(protein, data)
        if data.keep_start_codon and protein.startswith("M"):
            optimized_codons[0] = "ATG"
        optimized_sequence = "".join(optimized_codons)
        input_cds = data.sequence if data.input_type == "cds" else None

        replacements = replacement_rows(input_cds, optimized_codons, protein)
        codon_usage = codon_usage_rows(optimized_codons)
        restriction_hits = restriction_site_hits(optimized_sequence, data.avoid_sites or [])

        result = {
            "host": data.host,
            "input_type": data.input_type,
            "protein_sequence": protein,
            "optimized_sequence": optimized_sequence,
            "metrics": {
                "protein_length": len(protein),
                "optimized_length": len(optimized_sequence),
                "input_gc": round(gc_content(input_cds), 4) if input_cds else None,
                "optimized_gc": round(gc_content(optimized_sequence), 4),
                "optimized_gc_percent": round(gc_content(optimized_sequence) * 100, 2),
                "cai_like": round(cai_like(optimized_codons, data.host), 4),
                "replacement_count": sum(1 for row in replacements if row["changed"]),
                "restriction_site_hits": restriction_hits,
            },
            "codon_usage": codon_usage,
            "replacements": replacements,
            "warnings": warnings_for_sequence(optimized_sequence, data, restriction_hits),
            "parameters": {
                "min_gc": data.min_gc,
                "max_gc": data.max_gc,
                "avoid_sites": data.avoid_sites or [],
                "keep_start_codon": data.keep_start_codon,
            },
            "files": {
                "json": "result.json",
                "fasta": "optimized_sequence.fasta",
                "codon_usage_csv": "codon_usage.csv",
                "replacements_csv": "replacements.csv",
            },
        }

        write_json(workdir / "result.json", result)
        write_text(workdir / "optimized_sequence.fasta", f">optimized_{data.host}\n{optimized_sequence}\n")
        write_csv(workdir / "codon_usage.csv", codon_usage)
        write_csv(workdir / "replacements.csv", replacements)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_codon_optimization_result(workdir / "result.json")


def optimize_protein(protein: str, data: CodonOptimizationInput) -> list[str]:
    codons: list[str] = []
    target_gc = (data.min_gc + data.max_gc) / 2
    for aa in protein:
        ranked = HOST_PREFERENCES[data.host][aa]
        codons.append(
            min(
                ranked,
                key=lambda codon: (
                    abs(gc_content("".join(codons) + codon) - target_gc) * 0.35
                    - codon_weight(codon, data.host),
                    gc_penalty(codon, target_gc),
                ),
            )
        )
    return codons


def translate_cds(sequence: str) -> str:
    return "".join(GENETIC_CODE[sequence[index:index + 3]] for index in range(0, len(sequence), 3))


def codon_weight(codon: str, host: str) -> float:
    aa = GENETIC_CODE[codon]
    ranked = HOST_PREFERENCES[host][aa]
    try:
        index = ranked.index(codon)
    except ValueError:
        index = len(ranked)
    return max(0.15, 1.0 - index * 0.15)


def cai_like(codons: list[str], host: str) -> float:
    if not codons:
        return 0.0
    return exp(sum(log(codon_weight(codon, host)) for codon in codons) / len(codons))


def gc_content(sequence: str | None) -> float:
    if not sequence:
        return 0.0
    return (sequence.count("G") + sequence.count("C")) / len(sequence)


def gc_penalty(codon: str, target_gc: float) -> float:
    return abs(gc_content(codon) - target_gc)


def replacement_rows(input_cds: str | None, optimized_codons: list[str], protein: str) -> list[dict[str, Any]]:
    input_codons = [input_cds[index:index + 3] for index in range(0, len(input_cds), 3)] if input_cds else []
    rows: list[dict[str, Any]] = []
    for index, optimized in enumerate(optimized_codons):
        original = input_codons[index] if index < len(input_codons) else ""
        rows.append(
            {
                "position": index + 1,
                "amino_acid": protein[index],
                "original_codon": original,
                "optimized_codon": optimized,
                "changed": bool(original and original != optimized),
            }
        )
    return rows


def codon_usage_rows(codons: list[str]) -> list[dict[str, Any]]:
    counts = Counter(codons)
    total = len(codons) or 1
    return [
        {
            "codon": codon,
            "amino_acid": GENETIC_CODE[codon],
            "count": count,
            "frequency": round(count / total, 4),
        }
        for codon, count in sorted(counts.items())
    ]


def restriction_site_hits(sequence: str, sites: list[str]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for site in sites:
        start = sequence.find(site)
        while start != -1:
            hits.append({"site": site, "start": start + 1, "end": start + len(site)})
            start = sequence.find(site, start + 1)
    return hits


def warnings_for_sequence(
    sequence: str,
    data: CodonOptimizationInput,
    restriction_hits: list[dict[str, Any]],
) -> list[str]:
    warnings: list[str] = []
    optimized_gc = gc_content(sequence)
    if optimized_gc < data.min_gc or optimized_gc > data.max_gc:
        warnings.append("Optimized GC content is outside the requested range.")
    if restriction_hits:
        warnings.append("Optimized sequence still contains requested restriction sites.")
    if any(base * 6 in sequence for base in "ACGT"):
        warnings.append("Optimized sequence contains homopolymer runs of 6 or more bases.")
    return warnings
