from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

class Application(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_type: str = Field(min_length=1,max_length=40)
    requested_coverage: FiniteFloat = Field(gt=0,le=100_000_000)
    deductible: FiniteFloat = Field(ge=0,le=10_000_000)
    payment_frequency: str = Field(min_length=1,max_length=40)
    channel: str = Field(min_length=1,max_length=40)
    submission_velocity_24h: FiniteFloat = Field(ge=0,le=10000)
    recent_change_count: FiniteFloat = Field(ge=0,le=10000)

class ScoreRequest(Application): pass
class BatchRequest(BaseModel):
    applications: list[Application] = Field(min_length=1,max_length=100)
class Residual(BaseModel):
    feature: str
    residual: float
class ScoreResponse(BaseModel):
    model_version: str
    anomaly_score: float
    threshold: float
    review_recommended: bool
    feature_deviations: dict[str,float]
    top_deviations: list[Residual]
    disclaimer: str
class BatchResponse(BaseModel): results: list[ScoreResponse]
class DemoRecord(Application):
    sample_id: str
    demo_group: Literal["baseline", "unusual_demo"]
class DemoSamples(BaseModel): records: list[DemoRecord]
