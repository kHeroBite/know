#!/bin/bash
# know 시스템 통합 중지 스크립트 (재발방지 강화 버전, 2026-04-13)
# 위치: /home/know/apps/know-ops/shutdown.sh
#
# 개선사항:
# 1. uvicorn 프로세스 그룹 전체를 pkill로 죽임 (부모+자식+고아 워커)
# 2. multiprocessing 워커 정확한 패턴으로 감지 ("spawn_main" 포함)
# 3. pyc 캐시 전량 삭제 (startup 전 완전 초기화)
# 4. 잔존 확인 루프 (최대 3회 강제 종료 시도)

echo "=== know 시스템 중지 ==="

APP_DIR="/home/know/apps/know-ops/www"

# 1. uvicorn + multiprocessing 워커 완전 종료
kill_all_uvicorn() {
    # uvicorn 프로세스 (부모)
    pkill -9 -f "uvicorn.*main" 2>/dev/null
    # multiprocessing spawn 워커 (고아 방지)
    pkill -9 -f "multiprocessing.spawn" 2>/dev/null
    pkill -9 -f "spawn_main.*tracker_fd" 2>/dev/null
    # multiprocessing resource_tracker
    pkill -9 -f "multiprocessing.resource_tracker" 2>/dev/null
    sleep 1
}

echo "[..] uvicorn/multiprocessing 워커 종료 중..."
for attempt in 1 2 3; do
    kill_all_uvicorn
    REMAIN=$(pgrep -af "uvicorn.*main|multiprocessing.spawn|spawn_main.*tracker_fd|multiprocessing.resource_tracker" 2>/dev/null | grep -v grep)
    if [ -z "$REMAIN" ]; then
        echo "[OK] uvicorn 완전 종료 (시도 ${attempt}회)"
        break
    fi
    echo "[..] 잔존 프로세스 감지, 재시도 ${attempt}: $REMAIN"
done

# 최종 확인
REMAIN=$(pgrep -af "uvicorn.*main|multiprocessing.spawn|spawn_main.*tracker_fd" 2>/dev/null | grep -v grep)
if [ -n "$REMAIN" ]; then
    echo "[ERROR] 프로세스 잔존: $REMAIN"
fi

# 2. .pyc 캐시 완전 청소 (재발방지 핵심)
echo "[..] .pyc 캐시 청소 중..."
find "$APP_DIR" -name "*.pyc" -delete 2>/dev/null
find "$APP_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
PYC_COUNT=$(find "$APP_DIR" -name "*.pyc" 2>/dev/null | wc -l)
if [ "$PYC_COUNT" -eq 0 ]; then
    echo "[OK] .pyc 캐시 청소 완료"
else
    echo "[WARN] .pyc 잔존: ${PYC_COUNT}개"
fi

# 3. Redis 중지
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

# 4. 포트 확인
sleep 1
echo ""
echo "=== 상태 확인 ==="
echo "Redis:   $(pgrep -f redis-server > /dev/null 2>&1 && echo '아직 실행 중!' || echo '종료됨')"
echo "uvicorn: $(pgrep -f 'uvicorn.*main' > /dev/null 2>&1 && echo '아직 실행 중!' || echo '종료됨')"
echo "multipro: $(pgrep -f 'multiprocessing.spawn|spawn_main.*tracker_fd' > /dev/null 2>&1 && echo '아직 실행 중!' || echo '종료됨')"
echo "18000:   $(netstat -tlnp 2>/dev/null | grep -q 18000 && echo '사용 중!' || echo '해제됨')"
echo ""
echo "=== 중지 완료 ==="
