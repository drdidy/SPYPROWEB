"""SPX Prophet snapshot schema.

Pydantic mirror of the TypeScript ``SPXSnapshot`` contract in
``web/lib/types.ts``. The FastAPI ``/spx/snapshot`` endpoint will
return this shape; the Next.js shell consumes it directly.

The contract is symbol-agnostic about *where the engine lives* — once the
SPX core (previous-RTH pivot projection, scenario
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
    "PREV_RTH_HIGH_ASC",
    "PREV_RTH_HIGH_DESC",
    "PREV_RTH_LOW_ASC",
    "PREV_RTH_LOW_DESC",
    "SWING_HIGH_ASC",
    "SWING_HIGH_DESC",
    "SWING_LOW_ASC",
    "SWING_LOW_DESC",
]
SPXFanZone = Literal[
    "ABOVE_BOTH_CEILINGS",
    "BETWEEN_CEILINGS",
    "BELOW_BOTH_CEILINGS",
    "BELOW_HIGH_FLOOR",
    "PENDING",
]
SPXRthBiasDirection = Literal["BULLISH", "BEARISH", "NEUTRAL", "PENDING"]
SPXDeviationBiasDirection = Literal["BULLISH", "BEARISH", "NEUTRAL", "PENDING"]
SPXDeviationSignalSide = Literal["BUY", "SELL"]
SPXDeviationWindowKey = Literal["SETUP", "PRIMARY", "EXTENSION", "CLOSED"]
SPXDeviationWindowStatus = Literal["UPCOMING", "ACTIVE", "CLOSED"]
SPXControlTradeStatus = Literal["WAITING", "ARMED", "TRIGGERED", "CLOSED", "NO_CASH_SESSION"]
SPXControlMapId = Literal["DESCENDING_CLOSE", "ASCENDING_LOW"]
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
    entry_value: float | None = Field(default=None, alias="entryValue")
    entry_reference_time: str | None = Field(default=None, alias="entryReferenceTime")
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


class SPXFanRead(BaseModel):
    zone: SPXFanZone
    label: str
    summary: str
    primary_reference: Optional[SPXLineKind] = Field(default=None, alias="primaryReference")
    secondary_reference: Optional[SPXLineKind] = Field(default=None, alias="secondaryReference")

    model_config = {"populate_by_name": True}


class SPXRthBias(BaseModel):
    direction: SPXRthBiasDirection
    open_price: Optional[float] = Field(default=None, alias="openPrice")
    reference_line: Optional[SPXLineKind] = Field(default=None, alias="referenceLine")
    reference_value: Optional[float] = Field(default=None, alias="referenceValue")
    continuation_line: Optional[SPXLineKind] = Field(default=None, alias="continuationLine")
    continuation_value: Optional[float] = Field(default=None, alias="continuationValue")
    note: str

    model_config = {"populate_by_name": True}


class SPXDeviationFanLine(BaseModel):
    index: int
    label: str
    value: float
    current_value: float = Field(..., alias="currentValue")
    open_value: float = Field(..., alias="openValue")
    distance_from_price: float = Field(..., alias="distanceFromPrice")
    is_main: bool = Field(..., alias="isMain")

    model_config = {"populate_by_name": True}


class SPXDeviationFanBias(BaseModel):
    direction: SPXDeviationBiasDirection
    open_price: Optional[float] = Field(default=None, alias="openPrice")
    main_value: float = Field(..., alias="mainValue")
    distance_from_main: Optional[float] = Field(default=None, alias="distanceFromMain")
    note: str

    model_config = {"populate_by_name": True}


class SPXDeviationFanSignal(BaseModel):
    side: SPXDeviationSignalSide
    window_key: SPXDeviationWindowKey = Field(..., alias="windowKey")
    window_label: str = Field(..., alias="windowLabel")
    line_index: int = Field(..., alias="lineIndex")
    line_label: str = Field(..., alias="lineLabel")
    line_value: float = Field(..., alias="lineValue")
    candle_time: str = Field(..., alias="candleTime")
    next_candle_time: str = Field(..., alias="nextCandleTime")
    close: float
    note: str

    model_config = {"populate_by_name": True}


class SPXDeviationEntryWindow(BaseModel):
    key: SPXDeviationWindowKey
    label: str
    start: str
    end: str
    status: SPXDeviationWindowStatus
    guidance: str


class SPXDeviationHourlyClose(BaseModel):
    hour: int
    label: str
    time: str
    close: float


class SPXDeviationZone(BaseModel):
    label: str
    posture: str
    lower_line: Optional[str] = Field(default=None, alias="lowerLine")
    upper_line: Optional[str] = Field(default=None, alias="upperLine")
    call_entry_line: Optional[str] = Field(default=None, alias="callEntryLine")
    call_entry_value: Optional[float] = Field(default=None, alias="callEntryValue")
    put_entry_line: Optional[str] = Field(default=None, alias="putEntryLine")
    put_entry_value: Optional[float] = Field(default=None, alias="putEntryValue")
    room_read: Optional[str] = Field(default=None, alias="roomRead")
    broken_gate_line: Optional[str] = Field(default=None, alias="brokenGateLine")
    broken_gate_value: Optional[float] = Field(default=None, alias="brokenGateValue")
    broken_gate_role: Optional[Literal["RESISTANCE", "SUPPORT"]] = Field(default=None, alias="brokenGateRole")
    broken_gate_note: Optional[str] = Field(default=None, alias="brokenGateNote")
    next_reference: str = Field(..., alias="nextReference")
    distance_to_next: float = Field(..., alias="distanceToNext")
    guidance: str

    model_config = {"populate_by_name": True}


class SPXDescendingDeviationFan(BaseModel):
    anchor: SPXAnchor
    slope_per_hour: float = Field(..., alias="slopePerHour")
    spacing: float
    window_start: str = Field(..., alias="windowStart")
    entry_reference_time: str = Field(..., alias="entryReferenceTime")
    window_end: str = Field(..., alias="windowEnd")
    extension_end: str = Field(..., alias="extensionEnd")
    entry_main: float = Field(..., alias="entryMain")
    current_main: float = Field(..., alias="currentMain")
    open_main: float = Field(..., alias="openMain")
    open_bias: SPXDeviationFanBias = Field(..., alias="openBias")
    zone: SPXDeviationZone
    active_window: SPXDeviationEntryWindow = Field(..., alias="activeWindow")
    entry_windows: List[SPXDeviationEntryWindow] = Field(..., alias="entryWindows")
    hourly_closes: List[SPXDeviationHourlyClose] = Field(
        default_factory=list, alias="hourlyCloses",
    )
    nearest_line: SPXDeviationFanLine = Field(..., alias="nearestLine")
    lines: List[SPXDeviationFanLine]
    recent_signals: List[SPXDeviationFanSignal] = Field(
        default_factory=list, alias="recentSignals",
    )

    model_config = {"populate_by_name": True}


class SPXControlPlanMap(BaseModel):
    id: SPXControlMapId
    label: str
    direction: Literal["DESCENDING", "ASCENDING"]
    anchor: SPXAnchor
    slope_per_hour: float = Field(..., alias="slopePerHour")
    control_value: float = Field(..., alias="controlValue")
    arm_distance: float = Field(..., alias="armDistance")
    distance_from_open: Optional[float] = Field(default=None, alias="distanceFromOpen")
    status: Literal["ARMED", "DISTANT", "PENDING"]

    model_config = {"populate_by_name": True}


class SPXControlPlanSetup(BaseModel):
    side: SPXSide
    contract_type: SPXContractType = Field(..., alias="contractType")
    map_id: SPXControlMapId = Field(..., alias="mapId")
    map_label: str = Field(..., alias="mapLabel")
    entry_line: SPXLineKind = Field(..., alias="entryLine")
    entry_line_label: str = Field(..., alias="entryLineLabel")
    line_value: float = Field(..., alias="lineValue")
    entry_price: float = Field(..., alias="entryPrice")
    target_price: float = Field(..., alias="targetPrice")
    target_distance: float = Field(..., alias="targetDistance")
    status: Literal["WATCHING", "TRIGGERED", "CHASING"]
    thesis: str

    model_config = {"populate_by_name": True}


class SPXControlPlanSignal(SPXControlPlanSetup):
    signal_time: str = Field(..., alias="signalTime")
    entry_time: str = Field(..., alias="entryTime")
    signal_open: float = Field(..., alias="signalOpen")
    signal_high: float = Field(..., alias="signalHigh")
    signal_low: float = Field(..., alias="signalLow")
    signal_close: float = Field(..., alias="signalClose")
    note: str


class SPXControlTradePlan(BaseModel):
    status: SPXControlTradeStatus
    label: str
    entry_reference_time: str = Field(..., alias="entryReferenceTime")
    signal_window_start: str = Field(..., alias="signalWindowStart")
    signal_window_end: str = Field(..., alias="signalWindowEnd")
    target_distance: float = Field(..., alias="targetDistance")
    primary_map: SPXControlPlanMap = Field(..., alias="primaryMap")
    opposite_map: SPXControlPlanMap = Field(..., alias="oppositeMap")
    active_trade: Optional[SPXControlPlanSignal] = Field(default=None, alias="activeTrade")
    setups: List[SPXControlPlanSetup] = Field(default_factory=list)
    signals: List[SPXControlPlanSignal] = Field(default_factory=list)
    guidance: str

    model_config = {"populate_by_name": True}


class SPXSnapshot(BaseModel):
    symbol: Literal["SPX"] = "SPX"
    as_of: str = Field(..., alias="asOf")
    session_date_ct: str = Field(..., alias="sessionDateCT")

    overnight: SPXOvernight
    sessions: SPXSessions
    channel: SPXChannel
    fan_read: Optional[SPXFanRead] = Field(default=None, alias="fanRead")
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
    rth_bias: Optional[SPXRthBias] = Field(default=None, alias="rthBias")
    descending_deviation_fan: Optional[SPXDescendingDeviationFan] = Field(
        default=None, alias="descendingDeviationFan",
    )
    control_trade_plan: Optional[SPXControlTradePlan] = Field(
        default=None, alias="controlTradePlan",
    )

    model_config = {"populate_by_name": True}
