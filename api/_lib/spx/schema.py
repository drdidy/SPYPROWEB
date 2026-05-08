"""SPX Prophet snapshot schema.

Pydantic mirror of the TypeScript ``SPXSnapshot`` contract in
``web/lib/types.ts``. The FastAPI ``/spx/snapshot`` endpoint will
return this shape; the Next.js shell consumes it directly.

The contract is symbol-agnostic about *where the engine lives* — once the
SPX core (overnight channel determination, six-line projection, scenario
classifier, confluence) is integrated under ``api/``, an adapter populates
``SPXSnapshot`` and the surface starts rendering live.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


SPXChannelDirection = Literal["ASCENDING", "DESCENDING", "NONE"]
SPXNoChannelReason = Literal["EXPANSION", "CONTRACTION"]
SPXScenario = Literal[
    "ABOVE_ASCENDING",
    "INSIDE_ASCENDING",
    "BELOW_ASCENDING",
    "ABOVE_DESCENDING",
    "INSIDE_DESCENDING",
    "BELOW_DESCENDING",
    "OUTSIDE_PLAY",
]
SPXLineKind = Literal[
    "CHANNEL_CEILING",
    "CHANNEL_FLOOR",
    "PREV_RTH_HIGH_ASC",
    "PREV_RTH_LOW_DESC",
]
SPXAction = Literal["TAKE", "SELECTIVE", "STAND_DOWN"]
SPXSide = Literal["BUY", "SELL"]
SPXContractType = Literal["CALL", "PUT"]
SPXReentrySide = Literal["BUY_FROM_ABOVE", "SELL_FROM_BELOW"]
SPXConfluenceKey = Literal[
    "asian",
    "london",
    "reaction",
    "factor4_tbd",
    "factor5_tbd",
]


class SPXAnchor(BaseModel):
    price: float
    time: str  # ISO, CT-anchored


class SPXSessionRange(BaseModel):
    high: float
    low: float
    high_time: str = Field(..., alias="highTime")
    low_time: str = Field(..., alias="lowTime")

    model_config = {"populate_by_name": True}


class SPXLine(BaseModel):
    kind: SPXLineKind
    name: str
    anchor_price: float = Field(..., alias="anchorPrice")
    anchor_time: str = Field(..., alias="anchorTime")
    slope_per_hour: float = Field(..., alias="slopePerHour")
    current_value: float = Field(..., alias="currentValue")
    distance_from_price: float = Field(..., alias="distanceFromPrice")

    model_config = {"populate_by_name": True}


class SPXTrade(BaseModel):
    side: SPXSide
    entry_line: SPXLineKind = Field(..., alias="entryLine")
    entry_price: float = Field(..., alias="entryPrice")
    exit_line: SPXLineKind = Field(..., alias="exitLine")
    exit_price: float = Field(..., alias="exitPrice")

    model_config = {"populate_by_name": True}


class SPXContractSuggestion(BaseModel):
    type: SPXContractType
    strike: float
    expiration: str  # ISO date
    dte_label: str = Field(..., alias="dteLabel")
    distance_from_spot: float = Field(..., alias="distanceFromSpot")

    model_config = {"populate_by_name": True}


class SPXConfluenceFactor(BaseModel):
    key: SPXConfluenceKey
    label: str
    value: float  # 0..1
    weight: float  # 0..1
    contribution: float
    note: Optional[str] = None


class SPXReentryWatch(BaseModel):
    active: bool
    side: Optional[SPXReentrySide] = None
    detail: str


class SPXOvernightWindow(BaseModel):
    start: str
    end: str


class SPXOvernight(BaseModel):
    window: SPXOvernightWindow
    high: SPXAnchor
    low: SPXAnchor


class SPXSessions(BaseModel):
    sydney: SPXSessionRange
    tokyo: SPXSessionRange


class SPXChannel(BaseModel):
    direction: SPXChannelDirection
    reason: str
    no_channel_reason: Optional[SPXNoChannelReason] = Field(
        default=None, alias="noChannelReason"
    )

    model_config = {"populate_by_name": True}


class SPXPrice(BaseModel):
    last: float
    change: float
    change_pct: float = Field(..., alias="changePct")

    model_config = {"populate_by_name": True}


class SPXPlays(BaseModel):
    primary: Optional[SPXTrade] = None
    alternate: Optional[SPXTrade] = None


class SPXContracts(BaseModel):
    for_primary: Optional[SPXContractSuggestion] = Field(
        default=None, alias="forPrimary"
    )
    for_alternate: Optional[SPXContractSuggestion] = Field(
        default=None, alias="forAlternate"
    )

    model_config = {"populate_by_name": True}


class SPXConfluence(BaseModel):
    factors: List[SPXConfluenceFactor]
    score: float  # 0..100
    action: SPXAction


class SPXSnapshot(BaseModel):
    symbol: Literal["SPX"] = "SPX"
    as_of: str = Field(..., alias="asOf")
    session_date_ct: str = Field(..., alias="sessionDateCT")

    overnight: SPXOvernight
    sessions: SPXSessions
    channel: SPXChannel
    lines: List[SPXLine]
    price: SPXPrice

    scenario: SPXScenario
    scenario_explanation: str = Field(..., alias="scenarioExplanation")

    plays: SPXPlays
    contracts: SPXContracts
    reentry_watch: SPXReentryWatch = Field(..., alias="reentryWatch")
    confluence: SPXConfluence

    model_config = {"populate_by_name": True}
