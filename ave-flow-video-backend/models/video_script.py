from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal


# ── Available visual effects ──────────────────────────────────────
MOTION_EFFECTS = [
    "center_zoom",      # Slow zoom into center – dramatic
    "slow_zoom_out",    # Slow zoom out – reveal
    "pan_left",         # Gentle pan left
    "pan_right",        # Gentle pan right
    "drift_up",         # Slow drift upward
    "drift_down",       # Slow drift downward
    "ken_burns_tl",     # Ken Burns: top-left to bottom-right
    "ken_burns_br",     # Ken Burns: bottom-right to top-left
    "static",           # No motion (for video clips)
]


class ScriptSegment(BaseModel):
    """A subtitle segment with timing and styling"""
    text: str = Field(..., description="Text content to display")
    start_time: float = Field(..., description="Start time in seconds")
    duration: float = Field(..., description="Display duration in seconds")
    style: str = Field(
        default="Body",
        description="HookTop | Body | CallToAction"
    )


class VisualScene(BaseModel):
    """A video scene with media and effect"""
    media_type: str = Field(
        ...,
        description="image | video | cover"
    )
    media_index: int = Field(
        ...,
        description="0-based index into screenshots or videos array"
    )
    start_time: float = Field(..., description="Scene start time (seconds)")
    duration: float = Field(..., description="Scene duration (seconds)")
    motion: Optional[str] = Field(
        default="center_zoom",
        description="Motion effect for images. One of: "
                    "center_zoom, slow_zoom_out, pan_left, pan_right, "
                    "drift_up, drift_down, ken_burns_tl, ken_burns_br, static"
    )
    transition: Optional[str] = Field(
        default="fade",
        description="Transition type: fade | none"
    )

    @field_validator('motion')
    @classmethod
    def validate_motion(cls, v):
        if v is None or v == '' or v == 'none':
            return 'static'
        if v not in MOTION_EFFECTS:
            return 'center_zoom'
        return v


class VideoScript(BaseModel):
    """Full script structure from Gemini"""
    script_text: str = Field(..., description="Full script text for voiceover")
    total_duration: float = Field(..., description="Total video duration (seconds)")
    segments: list[ScriptSegment] = Field(..., description="Subtitle segments with timing")
    scenes: list[VisualScene] = Field(..., description="Visual scenes with media and effects")
    elevenlabs_voice_id: str = Field(
        default="JBFqnCBsd6RMkjVDRZzb",
        description="ElevenLabs voice ID matching the tone"
    )
    voice_stability: float = Field(default=0.5, ge=0.0, le=1.0)
    voice_similarity: float = Field(default=0.75, ge=0.0, le=1.0)


