"""
Plugin Manager & Service Registry for Gemini Hub Server
Handles plugin lifecycle, tool routing, and Gemini tool declaration exports.
"""
import os
import sys
import importlib
import inspect
import logging
import traceback
from typing import Dict, List, Any, Optional
from .base import BasePlugin, ToolDefinition

logger = logging.getLogger("hub.plugin_manager")


class PluginManager:
    """Central registry and execution router for all service plugins."""

    def __init__(self, plugins_dir: Optional[str] = None):
        self.plugins_dir = plugins_dir or os.path.dirname(os.path.abspath(__file__))
        self._plugins: Dict[str, BasePlugin] = {}
        self._tools: Dict[str, ToolDefinition] = {}
        self._enabled_plugins: set = set()

    def register_plugin(self, plugin: BasePlugin, config: Optional[Dict[str, Any]] = None, enabled: bool = True) -> bool:
        """Registers a plugin instance."""
        p_id = plugin.id
        if p_id in self._plugins:
            logger.warning(f"Plugin '{p_id}' already registered. Overwriting.")

        try:
            success = plugin.initialize(config or {})
            if not success:
                logger.error(f"Plugin '{p_id}' failed to initialize.")
                return False
        except Exception as e:
            logger.error(f"Error initializing plugin '{p_id}': {e}\n{traceback.format_exc()}")
            return False

        self._plugins[p_id] = plugin
        if enabled:
            self._enabled_plugins.add(p_id)

        # Register tools
        for tool in plugin.get_tools():
            full_name = f"{p_id}_{tool.name}"
            self._tools[full_name] = tool
            logger.info(f"Registered tool: {full_name}")

        logger.info(f"Successfully registered plugin '{p_id}' ({plugin.name}) with {len(plugin.get_tools())} tools.")
        return True

    def toggle_plugin(self, plugin_id: str, enabled: Optional[bool] = None) -> bool:
        """Enables or disables a plugin."""
        if plugin_id not in self._plugins:
            return False

        if enabled is None:
            if plugin_id in self._enabled_plugins:
                self._enabled_plugins.remove(plugin_id)
            else:
                self._enabled_plugins.add(plugin_id)
        elif enabled:
            self._enabled_plugins.add(plugin_id)
        else:
            self._enabled_plugins.discard(plugin_id)

        return plugin_id in self._enabled_plugins

    def is_plugin_enabled(self, plugin_id: str) -> bool:
        return plugin_id in self._enabled_plugins

    def get_plugin(self, plugin_id: str) -> Optional[BasePlugin]:
        return self._plugins.get(plugin_id)

    def list_plugins(self) -> List[Dict[str, Any]]:
        """Returns metadata for all registered plugins."""
        result = []
        for p_id, plugin in self._plugins.items():
            p_data = plugin.to_dict()
            p_data["enabled"] = p_id in self._enabled_plugins
            result.append(p_data)
        return result

    def get_gemini_declarations(self, only_enabled: bool = True) -> List[Dict[str, Any]]:
        """Generates Google Gemini FunctionDeclaration schemas for all available tools."""
        declarations = []
        for full_name, tool in self._tools.items():
            p_id = full_name.split("_", 1)[0]
            if only_enabled and p_id not in self._enabled_plugins:
                continue

            # Tool schema
            decl = tool.to_gemini_schema(namespace=p_id)
            declarations.append(decl)
        return declarations

    async def execute_tool(self, full_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Routes and executes a tool call requested by Gemini."""
        import re
        target_name = full_name
        if target_name not in self._tools:
            cleaned = re.sub(r'^(default_api|tools?)[:_.]', '', target_name)
            if cleaned in self._tools:
                target_name = cleaned

        if target_name not in self._tools:
            return {
                "success": False,
                "error": f"Tool '{full_name}' not found.",
                "available_tools": list(self._tools.keys())
            }

        p_id = target_name.split("_", 1)[0]
        if p_id not in self._enabled_plugins:
            return {
                "success": False,
                "error": f"Plugin '{p_id}' is currently disabled."
            }

        tool = self._tools[target_name]
        try:
            handler = tool.handler
            sig = inspect.signature(handler)
            has_var_keyword = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
            if not has_var_keyword:
                filtered_args = {k: v for k, v in arguments.items() if k in sig.parameters}
            else:
                filtered_args = arguments

            if inspect.iscoroutinefunction(handler):
                result = await handler(**filtered_args)
            else:
                result = handler(**filtered_args)

            return {
                "success": True,
                "tool": target_name,
                "result": result
            }
        except Exception as e:
            logger.error(f"Error executing tool '{target_name}': {e}\n{traceback.format_exc()}")
            return {
                "success": False,
                "tool": target_name,
                "error": str(e)
            }

    def shutdown(self):
        """Clean up all registered plugins."""
        for p_id, plugin in self._plugins.items():
            try:
                plugin.shutdown()
            except Exception as e:
                logger.warning(f"Error shutting down plugin '{p_id}': {e}")
