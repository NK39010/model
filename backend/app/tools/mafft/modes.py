# Defines supported MAFFT alignment modes and their command arguments.
from __future__ import annotations

from typing import Any


DEFAULT_MODE = "auto"
DEFAULT_MAFFT_VERSION = "7.526"

MAFFT_MODES: dict[str, dict[str, Any]] = {
    "auto": {
        "label": "Auto",
        "args": ["--auto"],
        "description": "由 MAFFT 根据序列数量和长度自动选择比对策略，适合不确定该用哪种算法的通用场景。",
    },
    "ginsi": {
        "label": "G-INS-i",
        "args": ["--globalpair", "--maxiterate", "1000"],
        "description": "全局高精度模式，适合全长同源、长度接近、整体相似的序列。",
    },
    "linsi": {
        "label": "L-INS-i",
        "args": ["--localpair", "--maxiterate", "1000"],
        "description": "局部高精度模式，适合只有部分区域高度保守、局部相似明显的序列。",
    },
    "einsi": {
        "label": "E-INS-i",
        "args": ["--genafpair", "--maxiterate", "1000"],
        "description": "适合存在长插入、长缺失或多个保守结构域的序列，比 G-INS-i 更能处理大 gap。",
    },
    "fftns2": {
        "label": "FFT-NS-2",
        "args": ["--retree", "2", "--maxiterate", "0"],
        "description": "快速模式，适合序列数量较多、需要快速得到初步比对结果的场景。",
    },
}

MODE_ALIASES = {
    "g-ins-i": "ginsi",
    "g_ins_i": "ginsi",
    "l-ins-i": "linsi",
    "l_ins_i": "linsi",
    "e-ins-i": "einsi",
    "e_ins_i": "einsi",
    "fft-ns-2": "fftns2",
    "fft_ns_2": "fftns2",
}


def normalize_mode(value: object) -> str:
    """Return the internal mode key for user-facing MAFFT mode names."""
    mode = str(value or DEFAULT_MODE).strip().lower()
    return MODE_ALIASES.get(mode, mode)

