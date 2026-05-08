"""SPX Prophet engine.

Pure trading logic: ES candles + offset -> SPXSnapshot.

Public surface:
    from spx import compute_snapshot
    from spx.candles import Candle
    from spx.offset import derive_offset
"""
from .candles import Candle
from .engine import compute_snapshot
from .offset import apply_offset, apply_offset_to_candle, apply_offset_to_series, derive_offset

__all__ = [
    "Candle",
    "apply_offset",
    "apply_offset_to_candle",
    "apply_offset_to_series",
    "compute_snapshot",
    "derive_offset",
]
