#!/bin/bash

# 檔案用途：快速測試腳本
# 功能：驗證新結構的語法和基本功能

echo "🧪 測試新專案結構..."
echo ""

# 測試 Python 語法
echo "1️⃣  檢查 Python 語法..."
python3 -c "import sys; sys.path.insert(0, 'backend'); import server; print('   ✅ backend/server.py')" || exit 1
python3 -c "import sys; sys.path.insert(0, 'backend/mcp_servers'); import local_repo_server; print('   ✅ backend/mcp_servers/local_repo_server.py')" || exit 1

# 測試配置檔案
echo ""
echo "2️⃣  檢查配置檔案..."
if [ -f "config/mcp.config.json" ]; then
    python3 -c "import json; json.load(open('config/mcp.config.json')); print('   ✅ config/mcp.config.json')" || exit 1
else
    echo "   ❌ config/mcp.config.json 不存在"
    exit 1
fi

# 測試前端檔案
echo ""
echo "3️⃣  檢查前端檔案..."
for file in frontend/index.html frontend/app.js frontend/styles.css; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file 不存在"
        exit 1
    fi
done

# 測試文件
echo ""
echo "4️⃣  檢查文件..."
for file in README.md AGENTS.md CLAUDE.md CONTRIBUTING.md docs/ARCHITECTURE.md; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file 不存在"
        exit 1
    fi
done

# 測試啟動腳本
echo ""
echo "5️⃣  檢查腳本..."
for file in start.sh test-structure.sh; do
    if [ -x "$file" ]; then
        echo "   ✅ $file (可執行)"
    elif [ -f "$file" ]; then
        echo "   ⚠️  $file (存在但不可執行)"
    else
        echo "   ❌ $file 不存在"
    fi
done

echo ""
echo "✅ 所有基本測試通過！"
echo ""
echo "📝 下一步："
echo "   1. 啟動伺服器: ./start.sh"
echo "   2. 執行單元測試: python3 -m unittest discover tests -v"
