"""
System Monitor Plugin for Gemini Hub Server
Demonstrates pluggable architecture for additional services.
Provides server hardware monitoring, resource usage, and time tools.
"""
import os
import sys
import platform
import psutil
from datetime import datetime
from typing import List, Dict, Any, Optional

from .base import BasePlugin, ToolDefinition, ToolParameter


class SystemPlugin(BasePlugin):
    """Server PC Hardware & System Monitoring Plugin."""

    @property
    def id(self) -> str:
        return "system"

    @property
    def name(self) -> str:
        return "서버 시스템 모니터링"

    @property
    def description(self) -> str:
        return "서버 PC의 CPU, 메모리, 디스크 사용량 및 시스템 상태를 모니터링하는 서비스"

    @property
    def icon(self) -> str:
        return "💻"

    @property
    def version(self) -> str:
        return "1.0.0"

    def tool_get_server_status(self) -> Dict[str, Any]:
        """서버 PC의 현재 CPU, RAM, 디스크 사용량 및 시스템 기본 정보를 조회합니다."""
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        return {
            "os": f"{platform.system()} {platform.release()}",
            "hostname": platform.node(),
            "cpu_percent": psutil.cpu_percent(interval=0.2),
            "cpu_count": psutil.cpu_count(logical=True),
            "memory": {
                "total_gb": round(mem.total / (1024 ** 3), 2),
                "used_gb": round(mem.used / (1024 ** 3), 2),
                "percent": mem.percent
            },
            "disk": {
                "total_gb": round(disk.total / (1024 ** 3), 2),
                "free_gb": round(disk.free / (1024 ** 3), 2),
                "percent": disk.percent
            },
            "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    def tool_get_server_time(self) -> Dict[str, Any]:
        """서버의 정확한 현재 일시, 요일 정보를 반환합니다."""
        now = datetime.now()
        weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
        return {
            "current_time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "weekday": weekdays[now.weekday()],
            "timestamp": int(now.timestamp())
        }

    def get_tools(self) -> List[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_server_status",
                description="서버 PC의 CPU, 메모리(RAM), 디스크 여유 공간 및 리소스 사용량을 조회합니다.",
                parameters={},
                handler=self.tool_get_server_status
            ),
            ToolDefinition(
                name="get_server_time",
                description="서버 PC의 정확한 현재 날짜, 시간, 요일 정보를 조회합니다.",
                parameters={},
                handler=self.tool_get_server_time
            )
        ]
