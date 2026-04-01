#!/bin/bash
# know 시스템 통합 시작 스크립트
# 위치: /home/know/apps/know-ops/startup.sh

echo "=== know 시스템 시작 ==="

# 1. Redis
if pgrep -f "redis-server" > /dev/null 2>&1; then
    echo "[SKIP] Redis 이미 실행 중 (PID: $(pgrep -f redis-server | head -1))"
else
    REDIS_BIN="/home/know/miniconda3/lib/python3.8/site-packages/redis_server/bin/redis-server"
    if [ -f "$REDIS_BIN" ]; then
        nohup "$REDIS_BIN" --port 6379 > /tmp/redis.log 2>&1 &
        sleep 1
        echo "[OK] Redis 시작 (PID: $!)"
    else
        echo "[WARN] Redis 바이너리 없음: $REDIS_BIN"
    fi
fi

# 2. uvicorn (FastAPI)
if pgrep -f "uvicorn.*main" > /dev/null 2>&1; then
    echo "[SKIP] uvicorn 이미 실행 중 (PID: $(pgrep -f 'uvicorn.*main' | head -1))"
else
    cd /home/know/apps/know-api
    nohup python3 -B -m uvicorn main:앱 --host 0.0.0.0 --port 18000 --workers 1 > /tmp/know-api.log 2>&1 &
    sleep 3
    echo "[OK] uvicorn 시작 (PID: $!)"
fi

# 3. 상태 확인
sleep 2
echo ""
echo "=== 상태 확인 ==="
echo "Redis:   $(pgrep -f redis-server > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"
echo "uvicorn: $(pgrep -f 'uvicorn.*main' > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"
echo "Health:  $(curl -s http://localhost:18000/api/health 2>/dev/null || echo 'FAIL')"
echo ""
echo "=== 시작 완료 ==="
