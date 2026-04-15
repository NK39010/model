# Describes sequence part parsing tools for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "sequence_parts_parse",
        "display_name": "Sequence Parts Parse",
        "version": "1.0.0",
        "description": "Parse GenBank text into ordered biological parts with inferred linkers.",
        "category": "sequence_parts",
        "runner": "app.tools.sequence_parts.runner.SequencePartsParseRunner",
        "input_schema": "SequencePartsParseInput",
        "output_schema": "SequencePartsParseOutput",
        "result_files": ["result.json", "parts.json", "source.gb"],
    },
]
