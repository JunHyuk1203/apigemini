"""
Base classes for Gemini Hub Server Plugins & Tools
Provides a standardized interface for pluggable services (RiroSchool, System, IoT, etc.)
"""
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolParameter(BaseModel):
    """Parameter definition for a Gemini Function Calling tool."""
    type: str = "STRING"  # STRING, INTEGER, NUMBER, BOOLEAN, OBJECT, ARRAY
    description: str
    enum: Optional[List[str]] = None
    default: Optional[Any] = None


class ToolDefinition(BaseModel):
    """Tool definition exposed to Gemini and callable by the Hub Server."""
    name: str
    description: str
    parameters: Dict[str, ToolParameter] = Field(default_factory=dict)
    required: List[str] = Field(default_factory=list)
    handler: Callable[..., Any]

    class Config:
        arbitrary_types_allowed = True

    def to_gemini_schema(self, namespace: str) -> dict:
        """Converts tool definition into Google Gemini FunctionDeclaration format."""
        props = {}
        for k, v in self.parameters.items():
            prop = {"type": v.type.upper(), "description": v.description}
            if v.enum:
                prop["enum"] = v.enum
            props[k] = prop

        full_name = f"{namespace}_{self.name}" if namespace else self.name

        schema = {
            "name": full_name,
            "description": self.description,
        }
        if props:
            schema["parameters"] = {
                "type": "OBJECT",
                "properties": props,
                "required": self.required
            }
        else:
            schema["parameters"] = {
                "type": "OBJECT",
                "properties": {}
            }
        return schema


class BasePlugin(ABC):
    """
    Base interface that all Hub plugins must implement.
    Any new service (Weather, Smart Home, Timetable, Scrapers, etc.)
    can be added by inheriting this class and placing it in plugins/.
    """

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier/namespace (e.g. 'riroschool', 'system')."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name displayed in the UI."""
        pass

    @property
    def description(self) -> str:
        return ""

    @property
    def icon(self) -> str:
        return "🔌"

    @property
    def version(self) -> str:
        return "1.0.0"

    def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize resources, sessions, or connections."""
        return True

    @abstractmethod
    def get_tools(self) -> List[ToolDefinition]:
        """Return list of ToolDefinitions provided by this plugin."""
        pass

    def get_status(self) -> Dict[str, Any]:
        """Return diagnostic status information for the UI."""
        return {"status": "ok"}

    def shutdown(self) -> None:
        """Clean up on server shutdown."""
        pass

    def to_dict(self) -> Dict[str, Any]:
        tools = self.get_tools()
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "version": self.version,
            "status": self.get_status(),
            "tools": [
                {
                    "name": t.name,
                    "full_name": f"{self.id}_{t.name}",
                    "description": t.description,
                    "parameters": {k: v.model_dump() for k, v in t.parameters.items()},
                    "required": t.required
                }
                for t in tools
            ]
        }
