"""Run with `python -m unittest discover -s tests` from data-server.
These checks require no database, SocketCAN device, AI model, or network service.
"""
import builtins
import dis
import importlib
import inspect
import pkgutil
import types
import unittest

from fastapi.testclient import TestClient
from app.main import app
from app.can.capture.shared import ACTIVE_CAPTURES, MarkerRequest
from app.can.capture.socketcan import parse_candump_line
from app.can.capture.simulation import baseline_frames


class FeatureBoundaries(unittest.TestCase):
    def test_capture_uses_one_registry_and_marker_command_shape(self):
        from app.can.capture import socketcan, sessions
        self.assertIs(socketcan.ACTIVE_CAPTURES, ACTIVE_CAPTURES)
        self.assertIs(sessions.ACTIVE_CAPTURES, ACTIVE_CAPTURES)
        marker = MarkerRequest(marker_type="action_start", client_event_id="stable-id")
        self.assertEqual(marker.client_event_id, "stable-id")
        self.assertIsNone(marker.timestamp_ms)  # Server owns the recording clock.

    def test_real_candump_and_simulation_frames_remain_distinct(self):
        parsed = parse_candump_line("(1700000000.125000) can0 123#01020304", 1700000000.0)
        self.assertIsNotNone(parsed)
        self.assertTrue(baseline_frames(7))
        for can_id, data, signal, decoded in baseline_frames(7):
            self.assertGreaterEqual(can_id, 0)
            self.assertTrue(all(0 <= byte <= 255 for byte in data))
            self.assertIsInstance(signal, str)
            self.assertIsInstance(decoded, str)

    def test_http_features_are_registered_once_without_starting_services(self):
        schema = app.openapi()
        self.assertIn("/data/can/session/start", schema["paths"])
        self.assertIn("/data/can/session/{session_id}/analyze", schema["paths"])
        self.assertIn("/data/can/mission-progress", schema["paths"])
        with TestClient(app) as client:
            self.assertEqual(client.get("/health").json()["service"], "aven-data-server")

    def test_relocated_functions_have_all_global_dependencies(self):
        # Catches a helper left behind during a future split, including helpers
        # referenced only inside an async branch or nested comprehension.
        def code_globals(code):
            yield from (instruction.argval for instruction in dis.get_instructions(code)
                        if instruction.opname in {"LOAD_GLOBAL", "LOAD_NAME"})
            for constant in code.co_consts:
                if isinstance(constant, types.CodeType):
                    yield from code_globals(constant)
        missing = []
        for package_name in ("capture", "analysis", "learning"):
            package = importlib.import_module(f"app.can.{package_name}")
            for info in pkgutil.iter_modules(package.__path__, package.__name__ + "."):
                module = importlib.import_module(info.name)
                for name, function in vars(module).items():
                    if not inspect.isfunction(function) or function.__module__ != module.__name__:
                        continue
                    for dependency in code_globals(function.__code__):
                        if dependency not in function.__globals__ and not hasattr(builtins, dependency):
                            missing.append(f"{info.name}.{name}: {dependency}")
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
