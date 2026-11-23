from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

class Application(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Tracking only: score() excludes this identifier from model input features.
    application_id: str | None = Field(default=None, min_length=1, max_length=100)
    policy_type: str = Field(min_length=1,max_length=40)
    requested_coverage: FiniteFloat = Field(gt=0,le=100_000_000)
    deductible: FiniteFloat = Field(ge=0,le=10_000_000)
    payment_frequency: str = Field(min_length=1,max_length=40)
    channel: str = Field(min_length=1,max_length=40)
    submission_velocity_24h: FiniteFloat = Field(ge=0,le=10000)
    recent_change_count: FiniteFloat = Field(ge=0,le=10000)
    # Optional synthetic flag evidence. These fields are validated and used only by
    # the flag rules; app.main.score excludes them from the VAE feature vector.
    duplicate_identity_reference_count: FiniteFloat = Field(default=0, ge=0, le=100)
    identity_document_consistency: FiniteFloat = Field(default=0.98, ge=0, le=1)
    application_detail_consistency: FiniteFloat = Field(default=0.98, ge=0, le=1)
    contact_reference_consistency: FiniteFloat = Field(default=0.98, ge=0, le=1)
    beneficiary_reference_consistency: FiniteFloat = Field(default=0.98, ge=0, le=1)
    repeat_submission_count: FiniteFloat = Field(default=0, ge=0, le=10000)

class ScoreRequest(Application): pass
class BatchRequest(BaseModel):
    applications: list[Application] = Field(min_length=1,max_length=100)
class Residual(BaseModel):
    feature: str
    residual: float
class ApplicationFlag(BaseModel):
    code: str
    category: str
    name: str
    severity: Literal["info", "review", "warning", "high"]
    triggering_value: str | float
    reference: str
    explanation: str
class ScoreResponse(BaseModel):
    application_id: str | None = None
    model_version: str
    anomaly_score: float
    threshold: float
    review_recommended: bool
    feature_deviations: dict[str,float]
    top_deviations: list[Residual]
    flags: list[ApplicationFlag] = Field(default_factory=list)
    disclaimer: str
class BatchResponse(BaseModel): results: list[ScoreResponse]
class DemoRecord(Application):
    sample_id: str
    demo_group: Literal["baseline", "unusual_demo"]
class DemoSamples(BaseModel): records: list[DemoRecord]
