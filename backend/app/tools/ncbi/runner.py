# Implements the NCBI Entrez RefSeq lookup tool runner.
from __future__ import annotations

from io import StringIO
import os
from pathlib import Path
from typing import Any

from app.services.file_service import write_json, write_text
from app.tools.base import ToolRunner
from app.tools.errors import ToolDependencyError, ToolExecutionError, ToolInputError
from app.tools.ncbi.parser import parse_ncbi_json_result
from app.tools.ncbi.schemas import (
    EntrezConfig,
    NCBIDatabase,
    NCBIRefSeqLookupInput,
    infer_db_from_accession,
)


class NCBIRefSeqLookupRunner(ToolRunner):
    """Fetch complete NCBI records by RefSeq or accession identifiers."""

    name = "ncbi_refseq_lookup"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        NCBIRefSeqLookupInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = NCBIRefSeqLookupInput.from_payload(payload)
        entrez = _configure_entrez(data.config)
        seqio = _get_seqio()
        grouped_ids = _group_ids_by_db(data.ids)
        records: list[dict[str, Any]] = []
        raw_files: dict[str, str] = {}

        for db, ids in grouped_ids.items():
            try:
                with entrez.efetch(
                    db=db.value,
                    id=",".join(ids),
                    rettype="gb",
                    retmode="text",
                ) as handle:
                    records_text = handle.read()
            except Exception as exc:
                raise ToolExecutionError(
                    "NCBI RefSeq lookup failed.",
                    {"db": db.value, "ids": ids, "reason": str(exc)},
                ) from exc

            raw_path = workdir / f"{db.value}_records.gb"
            write_text(raw_path, records_text)
            raw_files[db.value] = raw_path.name

            parsed_records = list(seqio.parse(StringIO(records_text), "genbank"))
            records.extend(_record_to_dict(record, db.value) for record in parsed_records)

        result = {
            "ids": data.ids,
            "record_count": len(records),
            "records": records,
            "files": {
                "json": "result.json",
                "raw": raw_files,
            },
        }
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_ncbi_json_result(
            workdir / "result.json",
            required_fields={"ids", "record_count", "records"},
        )


def _configure_entrez(config: EntrezConfig):
    try:
        from Bio import Entrez
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for NCBI Entrez tools.",
            {"install": "uv sync or pip install biopython"},
        ) from exc

    email = config.email or os.getenv("NCBI_EMAIL")
    if not email:
        raise ToolInputError(
            "NCBI Entrez requires an email.",
            {"set": "payload.email or NCBI_EMAIL"},
        )

    Entrez.tool = config.tool
    Entrez.email = email
    return Entrez


def _get_seqio():
    try:
        from Bio import SeqIO
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for NCBI record parsing.",
            {"install": "uv sync or pip install biopython"},
        ) from exc
    return SeqIO


def _group_ids_by_db(ids: list[str]) -> dict[NCBIDatabase, list[str]]:
    grouped: dict[NCBIDatabase, list[str]] = {}
    for accession in ids:
        db = infer_db_from_accession(accession)
        grouped.setdefault(db, []).append(accession)
    return grouped


def _record_to_dict(record: Any, db: str) -> dict[str, Any]:
    annotations = record.annotations
    features = [_feature_to_dict(feature) for feature in record.features]

    return {
        "db": db,
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "accessions": annotations.get("accessions", []),
        "version": annotations.get("sequence_version"),
        "organism": annotations.get("organism"),
        "taxonomy": annotations.get("taxonomy", []),
        "molecule_type": annotations.get("molecule_type"),
        "topology": annotations.get("topology"),
        "date": annotations.get("date"),
        "keywords": annotations.get("keywords", []),
        "source": annotations.get("source"),
        "sequence_length": len(record.seq),
        "sequence": str(record.seq),
        "references": [
            {
                "title": getattr(reference, "title", ""),
                "authors": getattr(reference, "authors", ""),
                "journal": getattr(reference, "journal", ""),
                "pubmed_id": getattr(reference, "pubmed_id", ""),
            }
            for reference in annotations.get("references", [])
        ],
        "features": features,
    }


def _feature_to_dict(feature: Any) -> dict[str, Any]:
    return {
        "type": feature.type,
        "location": str(feature.location),
        "qualifiers": {
            key: [str(item) for item in value]
            for key, value in feature.qualifiers.items()
        },
    }
