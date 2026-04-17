# Implements the NCBI BLAST lookup tool runner.
from __future__ import annotations

import os
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

from app.services.file_service import write_json, write_text
from app.tools.base import ToolRunner
from app.tools.blast.parser import parse_blast_json_result
from app.tools.blast.schemas import NCBIBlastLookupInput
from app.tools.errors import ToolDependencyError, ToolExecutionError, ToolInputError, ToolParseError


class NCBIBlastLookupRunner(ToolRunner):
    """Run remote BLAST against NCBI databases and parse top matches."""

    name = "ncbi_blast_lookup"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        NCBIBlastLookupInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = NCBIBlastLookupInput.from_payload(payload)
        email = data.config.email or os.getenv("NCBI_EMAIL")
        if not email:
            raise ToolInputError(
                "NCBI BLAST requires an email.",
                {"set": "payload.email or NCBI_EMAIL"},
            )

        xml_text = _run_qblast(data, email=email)
        write_text(workdir / "blast.xml", xml_text)

        result = _parse_blast_xml(
            xml_text=xml_text,
            query_id=data.query_id,
            query_sequence=data.query_sequence,
            program=data.program,
            database=data.database,
            max_hits=data.max_hits,
        )
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_blast_json_result(workdir / "result.json")


def _run_qblast(data: NCBIBlastLookupInput, email: str) -> str:
    try:
        from Bio.Blast import NCBIWWW
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for NCBI BLAST tools.",
            {"install": "uv sync or pip install biopython"},
        ) from exc

    # Some Biopython versions use a module-level email attribute.
    if hasattr(NCBIWWW, "email"):
        setattr(NCBIWWW, "email", email)

    query_fasta = f">{data.query_id}\n{data.query_sequence}\n"
    request_kwargs: dict[str, Any] = {
        "program": data.program,
        "database": data.database,
        "sequence": query_fasta,
        "expect": data.expect,
        "hitlist_size": data.max_hits,
        "format_type": "XML",
    }
    if data.entrez_query:
        request_kwargs["entrez_query"] = data.entrez_query
    if data.program == "blastn":
        request_kwargs["megablast"] = data.megablast

    try:
        with NCBIWWW.qblast(**request_kwargs) as handle:
            return handle.read()
    except Exception as exc:
        raise ToolExecutionError(
            "NCBI BLAST lookup failed.",
            {
                "program": data.program,
                "database": data.database,
                "reason": str(exc),
            },
        ) from exc


def _parse_blast_xml(
    xml_text: str,
    query_id: str,
    query_sequence: str,
    program: str,
    database: str,
    max_hits: int,
) -> dict[str, Any]:
    if not xml_text.strip():
        raise ToolParseError("NCBI BLAST did not return XML content.")

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ToolParseError("BLAST XML parsing failed.", {"reason": str(exc)}) from exc

    iteration = root.find("./BlastOutput_iterations/Iteration")
    if iteration is None:
        raise ToolParseError("BLAST XML is missing Iteration results.")

    query_def = _text_or_none(iteration.find("Iteration_query-def"))
    query_len = _int_or_none(_text_or_none(iteration.find("Iteration_query-len"))) or len(query_sequence)

    hits: list[dict[str, Any]] = []
    for index, hit in enumerate(iteration.findall("./Iteration_hits/Hit"), start=1):
        if len(hits) >= max_hits:
            break

        hit_hsps = hit.findall("./Hit_hsps/Hsp")
        hsp_summaries = [_hsp_summary(hsp, query_len=query_len) for hsp in hit_hsps]
        best_hsp = max(hsp_summaries, key=lambda item: item["bit_score"], default=None)
        if best_hsp is None:
            continue

        hits.append(
            {
                "rank": index,
                "hit_id": _text_or_none(hit.find("Hit_id")),
                "accession": _text_or_none(hit.find("Hit_accession")),
                "definition": _text_or_none(hit.find("Hit_def")),
                "length": _int_or_none(_text_or_none(hit.find("Hit_len"))),
                "hsp_count": len(hsp_summaries),
                "best_hsp": best_hsp,
                "hsps": hsp_summaries[:5],
            }
        )

    return {
        "query": {
            "id": query_id,
            "definition": query_def,
            "length": query_len,
        },
        "program": program,
        "database": database,
        "hit_count": len(hits),
        "hits": hits,
        "files": {
            "json": "result.json",
            "xml": "blast.xml",
        },
    }


def _hsp_summary(hsp: ET.Element, query_len: int) -> dict[str, Any]:
    align_len = _int_or_zero(_text_or_none(hsp.find("Hsp_align-len")))
    identities = _int_or_zero(_text_or_none(hsp.find("Hsp_identity")))
    gaps = _int_or_zero(_text_or_none(hsp.find("Hsp_gaps")))

    identity_pct = float(identities / align_len) if align_len else 0.0
    query_coverage = float(align_len / query_len) if query_len else 0.0

    return {
        "bit_score": _float_or_zero(_text_or_none(hsp.find("Hsp_bit-score"))),
        "score": _float_or_zero(_text_or_none(hsp.find("Hsp_score"))),
        "evalue": _float_or_zero(_text_or_none(hsp.find("Hsp_evalue"))),
        "identity_count": identities,
        "identity_pct": identity_pct,
        "align_len": align_len,
        "gaps": gaps,
        "query_from": _int_or_zero(_text_or_none(hsp.find("Hsp_query-from"))),
        "query_to": _int_or_zero(_text_or_none(hsp.find("Hsp_query-to"))),
        "hit_from": _int_or_zero(_text_or_none(hsp.find("Hsp_hit-from"))),
        "hit_to": _int_or_zero(_text_or_none(hsp.find("Hsp_hit-to"))),
        "query_coverage": query_coverage,
    }


def _text_or_none(node: ET.Element | None) -> str | None:
    if node is None or node.text is None:
        return None
    text = node.text.strip()
    return text or None


def _int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _int_or_zero(value: str | None) -> int:
    parsed = _int_or_none(value)
    return parsed if parsed is not None else 0


def _float_or_zero(value: str | None) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0
