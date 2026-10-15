"""
Gemini Hub Plugins Package
Exports BasePlugin, ToolDefinition, and PluginManager
"""
from .base import BasePlugin, ToolDefinition, ToolParameter
from .manager import PluginManager
from .riroschool_plugin import RiroSchoolPlugin
from .system_plugin import SystemPlugin
from .neis_plugin import NeisPlugin

__all__ = [
    "BasePlugin",
    "ToolDefinition",
    "ToolParameter",
    "PluginManager",
    "RiroSchoolPlugin",
    "SystemPlugin",
    "NeisPlugin",
]
