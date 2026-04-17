# Implements NCBI-backed resistance gene selection.
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.errors import ToolError
from app.tools.ncbi.element_search import search_ncbi_elements
from app.tools.resistance_marker_selection.parser import parse_resistance_marker_selection_result
from app.tools.resistance_marker_selection.schemas import ResistanceMarkerSelectionInput


MARKER_KEYWORDS = {
    "ampicillin": ["bla", "beta-lactamase", "ampicillin resistance"],
    "kanamycin": ["kanR", "aph(3')", "kanamycin resistance", "neomycin phosphotransferase"],
    "chloramphenicol": ["cat", "chloramphenicol acetyltransferase"],
    "tetracycline": ["tet", "tetA", "tetracycline resistance"],
    "spectinomycin": ["aadA", "spectinomycin resistance", "aminoglycoside adenylyltransferase"],
    "streptomycin": ["aadA", "streptomycin resistance", "streptomycin 3''-adenylyltransferase"],
    "gentamicin": ["aacC1", "gentamicin resistance", "aminoglycoside acetyltransferase"],
    "hygromycin": ["hph", "hygromycin phosphotransferase", "hygromycin resistance"],
    "puromycin": ["pac", "puromycin N-acetyltransferase", "puromycin resistance"],
    "neomycin": ["neo", "neomycin resistance", "G418 resistance"],
    "zeocin": ["Sh ble", "bleomycin resistance", "zeocin resistance"],
    "blasticidin": ["bsd", "blasticidin S deaminase", "blasticidin resistance"],
    "ura3": ["URA3", "orotidine-5'-phosphate decarboxylase"],
    "leu2": ["LEU2", "3-isopropylmalate dehydrogenase"],
}


class ResistanceMarkerSelectionRunner(ToolRunner):
    """Search NCBI for antibiotic or drug resistance gene sequences."""

    name = "resistance_marker_selection"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        ResistanceMarkerSelectionInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = ResistanceMarkerSelectionInput.from_payload(payload)
        warnings: list[str] = []
        candidates: list[dict[str, Any]] = []

        try:
            candidates = _ncbi_marker_candidates(data)
        except ToolError as exc:
            warnings.append(f"NCBI marker search failed: {exc.message}")

        candidates = sorted(candidates, key=lambda item: item["score"], reverse=True)[: data.max_results]
        result = {
            "query": {
                "host": data.host,
        "selection": data.selection,
        "marker_type": "antibiotic",
                "function": data.function,
                "max_results": data.max_results,
                "ncbi_max_records": data.ncbi_max_records,
            },
            "candidate_count": len(candidates),
            "candidates": candidates,
            "warnings": warnings,
            "files": {
                "json": "result.json",
                "csv": "markers.csv",
                "fasta": "markers.fasta",
            },
        }
        write_json(workdir / "result.json", result)
        write_csv(workdir / "markers.csv", [_csv_row(candidate) for candidate in candidates])
        write_text(workdir / "markers.fasta", _markers_to_fasta(candidates))
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_resistance_marker_selection_result(workdir / "result.json")


def _ncbi_marker_candidates(data: ResistanceMarkerSelectionInput) -> list[dict[str, Any]]:
    keywords = _keywords(data)
    records = search_ncbi_elements(
        query=_ncbi_query(data, keywords),
        email=data.email,
        feature_types={"cds", "gene", "misc_feature"},
        keywords=keywords,
        max_records=data.ncbi_max_records,
    )
    candidates: list[dict[str, Any]] = []
    for record in records:
        matched = record.get("matched_fields", [])
        score = 2.0 + len(matched) * 0.75
        if record.get("feature_type") == "cds":
            score += 1.0
        candidates.append(
            {
                "name": record["name"],
                "source": "ncbi",
                "host": data.host,
                "selection": data.selection,
                "marker_type": data.marker_type,
                "sequence": record["sequence"],
                "length": record["length"],
                "gc_content": record["gc_content"],
                "score": round(score, 2),
                "confidence": "high" if record.get("feature_type") == "cds" and matched else "medium",
                "reasons": ["NCBI GenBank feature matched", f"matched: {', '.join(matched)}"],
                "notes": f"NCBI {record['record_id']} {record['feature_type']} {record['location']}",
                "record_id": record["record_id"],
                "organism": record.get("organism"),
                "feature_type": record.get("feature_type"),
                "location": record.get("location"),
                "qualifiers": record.get("qualifiers", {}),
            }
        )
    return candidates


def _keywords(data: ResistanceMarkerSelectionInput) -> list[str]:
    terms: list[str] = []
    if data.selection:
        terms.extend(MARKER_KEYWORDS.get(data.selection.lower(), [data.selection]))
    if data.function:
        terms.extend(data.function.replace(",", " ").split())
    terms.extend(["resistance", "antibiotic"])
    if not terms:
        terms.extend(["resistance", "antibiotic resistance"])
    return sorted(set(term for term in terms if term))


def _ncbi_query(data: ResistanceMarkerSelectionInput, keywords: list[str]) -> str:
    host_query = _host_query(data.host)
    text_query = " OR ".join(f"{term}[All Fields]" for term in keywords)
    plasmid_hint = "(plasmid[All Fields] OR vector[All Fields] OR antibiotic resistance[All Fields])"
    if host_query:
        return f"({host_query}) AND ({text_query}) AND {plasmid_hint}"
    return f"({text_query}) AND {plasmid_hint}"


def _host_query(host: str) -> str:
    organisms = {
        "ecoli": "Escherichia coli[Organism]",
        "saccharomyces_cerevisiae": "Saccharomyces cerevisiae[Organism]",
        "yarrowia_lipolytica": "Yarrowia lipolytica[Organism]",
        "cho": "(Cricetulus griseus[Organism] OR Chinese hamster ovary[All Fields])",
        "mammalian": "Mammalia[Organism]",
        "any": "",
    }
    return organisms.get(host, "")


def _csv_row(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": candidate["name"],
        "source": candidate["source"],
        "host": candidate["host"],
        "selection": candidate["selection"],
        "marker_type": candidate["marker_type"],
        "length": candidate["length"],
        "gc_content": candidate["gc_content"],
        "score": candidate["score"],
        "confidence": candidate["confidence"],
        "record_id": candidate["record_id"],
        "sequence": candidate["sequence"],
        "notes": candidate["notes"],
    }


def _markers_to_fasta(candidates: list[dict[str, Any]]) -> str:
    return "".join(f">{candidate['name'].replace(' ', '_')}\n{candidate['sequence']}\n" for candidate in candidates)
