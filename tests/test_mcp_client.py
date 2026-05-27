"""
檔案用途：MCP 客戶端的單元測試
功能：測試 MCP 錯誤處理和基本功能
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from server import MCPError


class TestMCPClient(unittest.TestCase):
    def test_mcp_error_is_runtime_error(self):
        """Test MCPError is a RuntimeError subclass"""
        error = MCPError("test error")
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(str(error), "test error")
    
    def test_mcp_error_message(self):
        """Test MCPError message handling"""
        error = MCPError("Connection failed")
        self.assertIn("Connection failed", str(error))


if __name__ == '__main__':
    unittest.main()
