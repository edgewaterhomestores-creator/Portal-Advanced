@echo off
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" server\index.js > server.log 2> server.err.log
