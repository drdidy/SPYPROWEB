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
SPXEngineState = Literal[
    "STAND_DOWN", "WATCH", "WAIT", "ARMED", "GO", "COOLDOWN",
]
SPXTraceWeight = Literal["info", "key"]
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


# ---------------------------------------------------------------------------
# Phase-1 hardening: decision-trace surface. These fields exist on both SPY
# and SPX snapshots; the dashboard renders them in the Top Bar / cards /
# trace timeline. All optional so older clients keep working.
# ---------------------------------------------------------------------------


class SPXStateHistoryEntry(BaseModel):
    ts: str  # ISO timestamp
    state: SPXEngineState


class SPXDecisionTraceEntry(BaseModel):
    ts: str
    event: str
    weight: Optional[SPXTraceWeight] = None


class SPXInvalidation(BaseModel):
    level: float
    stop_offset: float = Field(..., alias="stopOffset")

    model_config = {"populate_by_name": True}


class SPXPlannedEnvelope(BaseModel):
    low: float
    high: float


class SPXScoreBands(BaseModel):
    stand_down: List[float] = Field(..., alias="standDown")
    watch: List[float]
    go: List[float]

    model_config = {"populate_by_name": True}


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

    # Phase-1 hardening: decision-trace surface (optional for compat).
    current_state: Optional[SPXEngineState] = Field(
        default=None, alias="currentState",
    )
    flip_condition: Optional[str] = Field(default=None, alias="flipCondition")
    state_history: List[SPXStateHistoryEntry] = Field(
        default_factory=list, alias="stateHistory",
    )
    decision_trace: List[SPXDecisionTraceEntry] = Field(
        default_factory=list, alias="decisionTrace",
    )
    invalidation: Optional[SPXInvalidation] = None
    planned_envelope: Optional[SPXPlannedEnvelope] = Field(
        default=None, alias="plannedEnvelope",
    )
    score_bands: Optional[SPXScoreBands] = Field(default=None, alias="scoreBands")

    model_config = {"populate_by_name": True}
