#!/bin/bash

# 檔案用途：快速啟動伺服器的腳本
# 功能：啟動 backend/server.py 並提供友善的訊息

echo "🚀 啟動 Agent Evaluation Dashboard..."
echo ""
echo "📂 專案結構已重構："
echo "   - 前端檔案: frontend/"
echo "   - 後端檔案: backend/"
echo "   - 配置檔案: config/"
echo "   - 文件: docs/"
echo ""
echo "🌐 伺服器啟動於: http://127.0.0.1:5173"
echo ""

cd "$(dirname "$0")"
python3 backend/server.py
