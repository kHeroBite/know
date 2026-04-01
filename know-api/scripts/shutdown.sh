#!/bin/bash
# know 시스템 통합 중지 스크립트
# 위치: /home/know/apps/know-ops/shutdown.sh

echo "=== know 시스템 중지 ==="

# 1. uvicorn 먼저 중지 (요청 처리 중단)
UVICORN_PIDS=$(pgrep -f "uvicorn.*main" 2>/dev/null)
if [ -n "$UVICORN_PIDS" ]; then
    echo "[..] uvicorn 중지 중..."
    kill $UVICORN_PIDS 2>/dev/null
    sleep 2
    # 워커 프로세스도 정리
    WORKER_PIDS=$(pgrep -f "multiprocessing.spawn" 2>/dev/null)
    if [ -n "$WORKER_PIDS" ]; then
        kill $WORKER_PIDS 2>/dev/null
        sleep 1
    fi
    # 잔류 확인
    if pgrep -f "uvicorn.*main" > /dev/null 2>&1; then
        kill -9 $(pgrep -f "uvicorn.*main") 2>/dev/null
        echo "[OK] uvicorn 강제 종료"
    else
        echo "[OK] uvicorn 종료"
    fi
else
    echo "[SKIP] uvicorn 미실행"
fi

# 2. Redis 중지
REDIS_PID=$(pgrep -f "redis-server" 2>/dev/null | head -1)
if [ -n "$REDIS_PID" ]; then
    kill "$REDIS_PID" 2>/dev/null
    sleep 1
    if pgrep -f "redis-server" > /dev/null 2>&1; then
        kill -9 "$REDIS_PID" 2>/dev/null
    fi
    echo "[OK] Redis 종료"
else
    echo "[SKIP] Redis 미실행"
fi

# 3. 포트 확인
sleep 1
echo ""
echo "=== 상태 확인 ==="
echo "Redis:   $(pgrep -f redis-server > /dev/null 2>&1 && echo '아직 실행 중!' || echo '종료됨')"
echo "uvicorn: $(pgrep -f 'uvicorn.*main' > /dev/null 2>&1 && echo '아직 실행 중!' || echo '종료됨')"
echo "18000:   $(netstat -tlnp 2>/dev/null | grep -q 18000 && echo '사용 중!' || echo '해제됨')"
echo ""
echo "=== 중지 완료 ==="
