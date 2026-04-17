# Implements vector construction and site-directed mutagenesis primer design.
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.primer_design.parser import parse_primer_design_result
from app.tools.primer_design.schemas import PrimerDesignInput


class PrimerDesignRunner(ToolRunner):
    """Design primers with simple, explainable PCR heuristics."""

    name = "primer_design"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        PrimerDesignInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = PrimerDesignInput.from_payload(payload)

        if data.mode == "vector_construction":
            primers = _vector_construction_primers(data)
        else:
            primers = _site_mutagenesis_primers(data)

        result = {
            "mode": data.mode,
            "primer_count": len(primers),
            "primers": primers,
            "parameters": {
                "homology_length": data.homology_length,
                "min_binding_length": data.min_binding_length,
                "max_binding_length": data.max_binding_length,
                "target_tm": data.target_tm,
                "tm_method": "Wallace for <14 nt, long-primer GC formula otherwise",
            },
            "files": {
                "json": "result.json",
                "csv": "primers.csv",
                "fasta": "primers.fasta",
            },
        }

        write_json(workdir / "result.json", result)
        write_csv(workdir / "primers.csv", [_csv_row(primer) for primer in primers])
        write_text(workdir / "primers.fasta", _primers_to_fasta(primers))
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_primer_design_result(workdir / "result.json")


def _vector_construction_primers(data: PrimerDesignInput) -> list[dict[str, Any]]:
    assert data.vector_sequence is not None
    assert data.insert_sequence is not None

    vector = data.vector_sequence
    insert = data.insert_sequence
    homology = data.homology_length

    vector_forward_binding = _best_binding_region(vector, "forward", data)
    vector_reverse_binding = _best_binding_region(vector, "reverse", data)
    insert_forward_binding = _best_binding_region(insert, "forward", data)
    insert_reverse_binding = _best_binding_region(insert, "reverse", data)

    primers = [
        _primer(
            name="vector_forward",
            role="vector_construction",
            sequence=insert[-homology:] + vector_forward_binding,
            binding_region=vector_forward_binding,
            homology_arm=insert[-homology:],
            note="Amplifies the linear vector and overlaps the insert end.",
        ),
        _primer(
            name="vector_reverse",
            role="vector_construction",
            sequence=reverse_complement(insert[:homology]) + vector_reverse_binding,
            binding_region=vector_reverse_binding,
            homology_arm=reverse_complement(insert[:homology]),
            note="Amplifies the linear vector and overlaps the insert start.",
        ),
        _primer(
            name="insert_forward",
            role="vector_construction",
            sequence=vector[-homology:] + insert_forward_binding,
            binding_region=insert_forward_binding,
            homology_arm=vector[-homology:],
            note="Amplifies the insert and overlaps the vector end.",
        ),
        _primer(
            name="insert_reverse",
            role="vector_construction",
            sequence=reverse_complement(vector[:homology]) + insert_reverse_binding,
            binding_region=insert_reverse_binding,
            homology_arm=reverse_complement(vector[:homology]),
            note="Amplifies the insert and overlaps the vector start.",
        ),
    ]
    return primers


def _site_mutagenesis_primers(data: PrimerDesignInput) -> list[dict[str, Any]]:
    assert data.gene_sequence is not None
    assert data.mutation is not None

    gene = data.gene_sequence
    mutation = data.mutation
    start = mutation.position - 1
    ref_len = len(mutation.ref) if mutation.ref else 1
    mutated = gene[:start] + mutation.alt + gene[start + ref_len :]

    target_center = start + len(mutation.alt) // 2
    primer_sequence = _mutation_window(mutated, target_center, data)
    primer_start = max(0, target_center - len(primer_sequence) // 2)
    mutation_offset = max(0, start - primer_start)

    return [
        _primer(
            name="mutation_forward",
            role="site_mutagenesis",
            sequence=primer_sequence,
            binding_region=primer_sequence,
            homology_arm="",
            note=f"Forward primer with mutation near index {mutation_offset + 1}.",
        ),
        _primer(
            name="mutation_reverse",
            role="site_mutagenesis",
            sequence=reverse_complement(primer_sequence),
            binding_region=reverse_complement(primer_sequence),
            homology_arm="",
            note="Reverse complement of the mutagenic forward primer.",
        ),
    ]


def _best_binding_region(sequence: str, direction: str, data: PrimerDesignInput) -> str:
    candidates: list[str] = []
    for length in range(data.min_binding_length, data.max_binding_length + 1):
        if direction == "forward":
            candidates.append(sequence[:length])
        else:
            candidates.append(reverse_complement(sequence[-length:]))
    return min(candidates, key=lambda item: (abs(tm(item) - data.target_tm), abs(gc_content(item) - 0.5)))


def _mutation_window(sequence: str, center: int, data: PrimerDesignInput) -> str:
    min_length = max(25, data.min_binding_length)
    max_length = max(31, min(45, data.max_binding_length + 16))
    candidates: list[str] = []

    for length in range(min_length, max_length + 1, 2):
        left = max(0, center - length // 2)
        right = min(len(sequence), left + length)
        left = max(0, right - length)
        if right - left >= min_length:
            candidates.append(sequence[left:right])

    return min(candidates, key=lambda item: (abs(tm(item) - data.target_tm), abs(gc_content(item) - 0.5)))


def _primer(
    name: str,
    role: str,
    sequence: str,
    binding_region: str,
    homology_arm: str,
    note: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "role": role,
        "sequence": sequence,
        "length": len(sequence),
        "binding_region": binding_region,
        "binding_length": len(binding_region),
        "homology_arm": homology_arm,
        "homology_length": len(homology_arm),
        "tm": round(tm(binding_region), 2),
        "gc_content": round(gc_content(sequence), 4),
        "gc_percent": round(gc_content(sequence) * 100, 2),
        "warnings": primer_warnings(sequence, binding_region),
        "note": note,
    }


def _csv_row(primer: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": primer["name"],
        "sequence": primer["sequence"],
        "length": primer["length"],
        "tm": primer["tm"],
        "gc_percent": primer["gc_percent"],
        "binding_length": primer["binding_length"],
        "homology_length": primer["homology_length"],
        "warnings": "; ".join(primer["warnings"]),
    }


def _primers_to_fasta(primers: list[dict[str, Any]]) -> str:
    return "".join(f">{primer['name']}\n{primer['sequence']}\n" for primer in primers)


def reverse_complement(sequence: str) -> str:
    return sequence.translate(str.maketrans("ACGT", "TGCA"))[::-1]


def gc_content(sequence: str) -> float:
    if not sequence:
        return 0.0
    return (sequence.count("G") + sequence.count("C")) / len(sequence)


def tm(sequence: str) -> float:
    if len(sequence) < 14:
        return 2 * (sequence.count("A") + sequence.count("T")) + 4 * (sequence.count("G") + sequence.count("C"))
    return 64.9 + 41 * ((sequence.count("G") + sequence.count("C")) - 16.4) / len(sequence)


def primer_warnings(sequence: str, binding_region: str) -> list[str]:
    warnings: list[str] = []
    primer_gc = gc_content(sequence)
    binding_tm = tm(binding_region)
    if primer_gc < 0.4 or primer_gc > 0.6:
        warnings.append("GC content is outside the common 40-60% range.")
    if binding_tm < 55 or binding_tm > 65:
        warnings.append("Binding-region Tm is outside the common 55-65 C range.")
    if _has_homopolymer(sequence):
        warnings.append("Primer contains a homopolymer run of 5 or more bases.")
    if gc_content(sequence[-5:]) > 0.8:
        warnings.append("3' end is GC-heavy.")
    return warnings


def _has_homopolymer(sequence: str) -> bool:
    return any(base * 5 in sequence for base in "ACGT")
